import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { defaultKnowledge, duplicateKey, AppError } from "./domain.js";
import { outreachKey } from "./outreach-domain.js";

const now = () => new Date().toISOString();
export function createStore(filename) {
  if (filename !== ":memory:")
    mkdirSync(dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS partners (id TEXT PRIMARY KEY, dedupe TEXT UNIQUE NOT NULL, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, status TEXT NOT NULL, kind TEXT NOT NULL, created_at TEXT NOT NULL, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS drafts (id TEXT PRIMARY KEY, partner_id TEXT NOT NULL REFERENCES partners(id), data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY AUTOINCREMENT, time TEXT NOT NULL, entity TEXT NOT NULL, message TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS calls (id TEXT PRIMARY KEY, time TEXT NOT NULL, input_tokens INTEGER, output_tokens INTEGER);
    CREATE TABLE IF NOT EXISTS contacts (id TEXT PRIMARY KEY, partner_id TEXT NOT NULL REFERENCES partners(id), channel TEXT NOT NULL, address TEXT NOT NULL, basis TEXT NOT NULL, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS outreach_templates (id TEXT PRIMARY KEY, channel TEXT NOT NULL, name TEXT NOT NULL, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS outreach_messages (id TEXT PRIMARY KEY, dedupe TEXT UNIQUE NOT NULL, contact_id TEXT NOT NULL REFERENCES contacts(id), status TEXT NOT NULL, direction TEXT NOT NULL, channel TEXT NOT NULL, purpose TEXT NOT NULL, created_at TEXT NOT NULL, scheduled_at TEXT, sent_at TEXT, provider_message_id TEXT, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS conversations (id TEXT PRIMARY KEY, contact_id TEXT NOT NULL REFERENCES contacts(id), channel TEXT NOT NULL, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS campaigns (id TEXT PRIMARY KEY, status TEXT NOT NULL, name TEXT NOT NULL, created_at TEXT NOT NULL, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS outreach_events (dedupe TEXT PRIMARY KEY, channel TEXT NOT NULL, type TEXT NOT NULL, time TEXT NOT NULL, data TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_messages_status ON outreach_messages(status, scheduled_at);
    CREATE INDEX IF NOT EXISTS idx_messages_sent ON outreach_messages(direction, sent_at);
    CREATE INDEX IF NOT EXISTS idx_messages_provider ON outreach_messages(provider_message_id);
    CREATE INDEX IF NOT EXISTS idx_contacts_lookup ON contacts(channel, address);
    CREATE INDEX IF NOT EXISTS idx_conversations_contact ON conversations(contact_id);
  `);
  const json = (r) => (r ? JSON.parse(r.data) : null);
  const log = (entity, message) =>
    db
      .prepare("INSERT INTO audit(time,entity,message) VALUES(?,?,?)")
      .run(now(), entity, message);
  const store = {
    db,
    log,
    partners: () =>
      db
        .prepare("SELECT data FROM partners ORDER BY rowid DESC")
        .all()
        .map(json),
    partner: (id) =>
      json(db.prepare("SELECT data FROM partners WHERE id=?").get(id)),
    addPartner(p, extra = {}) {
      const id = randomUUID();
      const data = { ...p, id, createdAt: now(), updatedAt: now(), ...extra };
      if (
        db
          .prepare("SELECT id FROM partners WHERE dedupe=?")
          .get(duplicateKey(p))
      )
        return null;
      db.prepare("INSERT INTO partners(id,dedupe,data) VALUES(?,?,?)").run(
        id,
        duplicateKey(p),
        JSON.stringify(data),
      );
      log(id, `Struttura aggiunta: ${p.company}. Stato: ${p.status}.`);
      return data;
    },
    updatePartner(id, p) {
      const old = store.partner(id);
      if (!old) throw new AppError(404, "Struttura non trovata.");
      const dup = db
        .prepare("SELECT id FROM partners WHERE dedupe=? AND id<>?")
        .get(duplicateKey(p), id);
      if (dup)
        throw new AppError(
          409,
          "Esiste già una struttura con lo stesso nome e la stessa città.",
        );
      const data = { ...old, ...p, updatedAt: now() };
      db.prepare("UPDATE partners SET dedupe=?,data=? WHERE id=?").run(
        duplicateKey(p),
        JSON.stringify(data),
        id,
      );
      // Any partner change invalidates earlier draft approvals, including opt-out.
      for (const draft of store
        .drafts()
        .filter((d) => d.partnerId === id && d.status === "approved"))
        store.updateDraft(draft.id, { status: "review", approvedAt: null });
      log(
        id,
        `Scheda aggiornata. Qualifica: ${p.status}. Canale: ${p.contactBasis}. Approvazioni precedenti revocate.`,
      );
      return data;
    },
    isPaused() {
      return !!json(
        db.prepare("SELECT data FROM settings WHERE key='paused'").get(),
      );
    },
    setPaused(value) {
      db.prepare(
        "INSERT INTO settings(key,data) VALUES('paused',?) ON CONFLICT(key) DO UPDATE SET data=excluded.data",
      ).run(JSON.stringify(value));
      log("AGENTE", value ? "Agente sospeso." : "Agente riattivato.");
    },
    knowledge() {
      return (
        json(
          db.prepare("SELECT data FROM settings WHERE key='knowledge'").get(),
        ) || structuredClone(defaultKnowledge)
      );
    },
    setKnowledge(p) {
      const data = {
        ...store.knowledge(),
        ...p,
        version: store.knowledge().version + 1,
        updatedAt: now(),
      };
      db.prepare(
        "INSERT INTO settings(key,data) VALUES('knowledge',?) ON CONFLICT(key) DO UPDATE SET data=excluded.data",
      ).run(JSON.stringify(data));
      for (const d of store.drafts().filter((d) => d.status === "approved"))
        store.updateDraft(d.id, { status: "review", approvedAt: null });
      log(
        "PETNOTE",
        `Scheda prodotto v${data.version} ${data.approved ? "approvata" : "in revisione"}. Approvazioni delle bozze revocate.`,
      );
      return data;
    },
    jobs: () =>
      db
        .prepare("SELECT data FROM jobs ORDER BY created_at DESC")
        .all()
        .map(json),
    job: (id) => json(db.prepare("SELECT data FROM jobs WHERE id=?").get(id)),
    addJob(kind, request, { provider = null, model = null } = {}) {
      const job = {
        id: randomUUID(),
        kind,
        provider,
        model,
        status: "queued",
        request,
        createdAt: now(),
        startedAt: null,
        finishedAt: null,
        error: null,
        result: null,
      };
      db.prepare(
        "INSERT INTO jobs(id,status,kind,created_at,data) VALUES(?,?,?,?,?)",
      ).run(job.id, job.status, kind, job.createdAt, JSON.stringify(job));
      log(
        job.id,
        kind === "research"
          ? "Ricerca richiesta dall’amministratore."
          : "Generazione bozza richiesta dall’amministratore.",
      );
      return job;
    },
    updateJob(id, patch) {
      const data = { ...store.job(id), ...patch };
      db.prepare("UPDATE jobs SET status=?,data=? WHERE id=?").run(
        data.status,
        JSON.stringify(data),
        id,
      );
      return data;
    },
    recover() {
      for (const j of store
        .jobs()
        .filter((j) => ["queued", "running"].includes(j.status))) {
        store.updateJob(j.id, {
          status: "failed",
          finishedAt: now(),
          error:
            "Operazione interrotta dal riavvio. Avviala nuovamente se necessario.",
        });
        log(
          j.id,
          "Lavoro interrotto al riavvio: nessun riavvio automatico di chiamate a pagamento.",
        );
      }
    },
    drafts: () =>
      db.prepare("SELECT data FROM drafts ORDER BY rowid DESC").all().map(json),
    draft: (id) =>
      json(db.prepare("SELECT data FROM drafts WHERE id=?").get(id)),
    addDraft(partnerId, text, knowledgeVersion, jobId) {
      const d = {
        id: randomUUID(),
        partnerId,
        ...text,
        knowledgeVersion,
        jobId,
        status: "review",
        createdAt: now(),
        approvedAt: null,
      };
      db.prepare("INSERT INTO drafts(id,partner_id,data) VALUES(?,?,?)").run(
        d.id,
        partnerId,
        JSON.stringify(d),
      );
      log(
        d.id,
        "Bozza IA generata: revisione umana obbligatoria. Nessun invio.",
      );
      return d;
    },
    updateDraft(id, patch) {
      const old = store.draft(id);
      if (!old) throw new AppError(404, "Bozza non trovata.");
      const data = { ...old, ...patch, updatedAt: now() };
      db.prepare("UPDATE drafts SET data=? WHERE id=?").run(
        JSON.stringify(data),
        id,
      );
      return data;
    },
    audit: () =>
      db.prepare("SELECT * FROM audit ORDER BY id DESC LIMIT 500").all(),
    callCount: () =>
      db
        .prepare("SELECT count(*) AS n FROM calls WHERE time>=?")
        .get(now().slice(0, 10) + "T00:00:00.000Z").n,
    startCall() {
      const id = randomUUID();
      db.prepare("INSERT INTO calls(id,time) VALUES(?,?)").run(id, now());
      return id;
    },
    finishCall(id, usage = {}) {
      db.prepare(
        "UPDATE calls SET input_tokens=?,output_tokens=? WHERE id=?",
      ).run(
        Number.isSafeInteger(usage.input_tokens) ? usage.input_tokens : null,
        Number.isSafeInteger(usage.output_tokens) ? usage.output_tokens : null,
        id,
      );
    },
    usage: () =>
      db
        .prepare(
          "SELECT count(*) AS requests, sum(input_tokens) AS inputTokens, sum(output_tokens) AS outputTokens FROM calls",
        )
        .get(),
    session(token) {
      const hash = createHash("sha256")
        .update(token || "")
        .digest("hex");
      return !!db
        .prepare("SELECT hash FROM sessions WHERE hash=? AND expires>?")
        .get(hash, Date.now());
    },
    createSession(token) {
      db.prepare("DELETE FROM sessions WHERE expires<?").run(Date.now());
      db.prepare("INSERT INTO sessions(hash,expires) VALUES(?,?)").run(
        createHash("sha256").update(token).digest("hex"),
        Date.now() + 8 * 60 * 60 * 1000,
      );
    },
    deleteSession(token) {
      db.prepare("DELETE FROM sessions WHERE hash=?").run(
        createHash("sha256")
          .update(token || "")
          .digest("hex"),
      );
    },
    // --- Outreach: contact permissions, templates, approved messages, events ---
    isOutreachPaused: () =>
      !!json(db.prepare("SELECT data FROM settings WHERE key='outreachPaused'").get()),
    setOutreachPaused(value) {
      db.prepare(
        "INSERT INTO settings(key,data) VALUES('outreachPaused',?) ON CONFLICT(key) DO UPDATE SET data=excluded.data",
      ).run(JSON.stringify(!!value));
      log(
        "CONTATTI",
        value
          ? "Invii sospesi: nessun nuovo messaggio verrà consegnato a un provider."
          : "Invii riattivati. Restano obbligatori autorizzazione e approvazione.",
      );
    },
    outreachSendCount: (since = now().slice(0, 10) + "T00:00:00.000Z") =>
      db
        .prepare(
          "SELECT count(*) AS n FROM outreach_messages WHERE direction='outbound' AND sent_at>=?",
        )
        .get(since).n,
    contacts: () =>
      db.prepare("SELECT data FROM contacts ORDER BY rowid DESC").all().map(json),
    contact: (id) => json(db.prepare("SELECT data FROM contacts WHERE id=?").get(id)),
    findContact(channel, addr) {
      return json(
        db
          .prepare(
            "SELECT data FROM contacts WHERE channel=? AND address=? ORDER BY rowid DESC LIMIT 1",
          )
          .get(channel, String(addr || "").trim().toLowerCase()),
      );
    },
    partnerContacts: (partnerId) => store.contacts().filter((c) => c.partnerId === partnerId),
    addContact(c) {
      const existing = store.findContact(c.channel, c.address);
      if (existing)
        throw new AppError(
          409,
          "Esiste già un contatto con questo canale e recapito. Aggiorna quello esistente.",
        );
      const data = { ...c, id: randomUUID(), createdAt: now(), updatedAt: now() };
      db.prepare(
        "INSERT INTO contacts(id,partner_id,channel,address,basis,data) VALUES(?,?,?,?,?,?)",
      ).run(data.id, c.partnerId, c.channel, data.address, c.basis, JSON.stringify(data));
      log(
        data.id,
        `Contatto ${c.channel} registrato. Base: ${c.basis}. Nessun invio eseguito.`,
      );
      return data;
    },
    updateContact(id, patch) {
      const old = store.contact(id);
      if (!old) throw new AppError(404, "Contatto non trovato.");
      if (old.basis === "opt_out" && patch.basis && patch.basis !== "opt_out")
        throw new AppError(
          409,
          "Opt-out registrato: non può essere annullato da questa interfaccia. Verifica una nuova richiesta esplicita e documentala in una struttura diversa.",
        );
      const data = { ...old, ...patch, updatedAt: now() };
      db.prepare(
        "UPDATE contacts SET partner_id=?,channel=?,address=?,basis=?,data=? WHERE id=?",
      ).run(
        data.partnerId,
        data.channel,
        data.address,
        data.basis,
        JSON.stringify(data),
        id,
      );
      if (data.basis === "opt_out" && old.basis !== "opt_out") {
        for (const m of store.outreachMessages().filter(
          (x) => x.contactId === id && ["queued", "approved"].includes(x.status),
        ))
          store.updateOutreachMessage(m.id, {
            status: "blocked",
            blockedReason: "Opt-out registrato sul contatto.",
          });
      }
      log(id, `Contatto aggiornato. Base: ${data.basis}.`);
      return data;
    },
    templates: () =>
      db.prepare("SELECT data FROM outreach_templates ORDER BY rowid DESC").all().map(json),
    template: (id) =>
      json(db.prepare("SELECT data FROM outreach_templates WHERE id=?").get(id)),
    addTemplate(t) {
      if (
        store.templates().some((x) => x.channel === t.channel && x.name === t.name)
      )
        throw new AppError(409, "Esiste già un modello con questo nome e canale.");
      const data = { ...t, id: randomUUID(), createdAt: now(), updatedAt: now() };
      db.prepare(
        "INSERT INTO outreach_templates(id,channel,name,data) VALUES(?,?,?,?)",
      ).run(data.id, t.channel, t.name, JSON.stringify(data));
      log(
        data.id,
        `Modello ${t.channel} “${t.name}” salvato${
          t.channel === "whatsapp" ? ". Richiede un template approvato da Meta." : "."
        } Nessun invio.`,
      );
      return data;
    },
    updateTemplate(id, patch) {
      const old = store.template(id);
      if (!old) throw new AppError(404, "Modello non trovato.");
      const data = { ...old, ...patch, updatedAt: now() };
      db.prepare("UPDATE outreach_templates SET channel=?,name=?,data=? WHERE id=?").run(
        data.channel,
        data.name,
        JSON.stringify(data),
        id,
      );
      log(id, `Modello ${data.channel} “${data.name}” aggiornato.`);
      return data;
    },
    outreachMessages: () =>
      db.prepare("SELECT data FROM outreach_messages ORDER BY rowid DESC").all().map(json),
    outreachMessage: (id) =>
      json(db.prepare("SELECT data FROM outreach_messages WHERE id=?").get(id)),
    messageByProviderId(providerMessageId) {
      return json(
        db
          .prepare(
            "SELECT data FROM outreach_messages WHERE provider_message_id=? ORDER BY rowid DESC LIMIT 1",
          )
          .get(providerMessageId),
      );
    },
    addOutreachMessage(m) {
      const dedupe = outreachKey(m);
      const clash = db
        .prepare("SELECT data FROM outreach_messages WHERE dedupe=?")
        .get(dedupe);
      if (clash) return { message: json(clash), duplicate: true };
      const data = {
        ...m,
        id: randomUUID(),
        dedupe,
        status: "queued",
        direction: "outbound",
        channel: m.channel,
        createdAt: now(),
        updatedAt: now(),
        approvedAt: null,
        sentAt: null,
        deliveredAt: null,
        providerMessageId: null,
        provider: null,
        attempts: 0,
        restarts: 0,
        error: null,
        blockedReason: null,
      };
      db.prepare(
        `INSERT INTO outreach_messages(id,dedupe,contact_id,status,direction,channel,purpose,created_at,scheduled_at,sent_at,provider_message_id,data)
         VALUES(?,?,?,?,?,?,?,?,?,NULL,NULL,?)`,
      ).run(
        data.id,
        dedupe,
        data.contactId,
        data.status,
        data.direction,
        data.channel,
        data.purpose,
        data.createdAt,
        data.scheduledAt,
        JSON.stringify(data),
      );
      log(
        data.id,
        `Messaggio ${data.channel} (${data.purpose}) in coda: richiede approvazione. Nessun invio.`,
      );
      return { message: data, duplicate: false };
    },
    addInboundMessage(contact, { body, providerEventId, timestamp, type, subject, note }) {
      const data = {
        id: randomUUID(),
        dedupe: `inbound|${contact.channel}|${providerEventId}`,
        contactId: contact.id,
        partnerId: contact.partnerId,
        channel: contact.channel,
        direction: "inbound",
        purpose: "inbound",
        status: "received",
        address: contact.address,
        subject: subject || "",
        body: body ?? null,
        type: type || "text",
        note: note || null,
        providerEventId,
        providerMessageId: null,
        createdAt: timestamp || now(),
        updatedAt: now(),
      };
      db.prepare(
        `INSERT INTO outreach_messages(id,dedupe,contact_id,status,direction,channel,purpose,created_at,scheduled_at,sent_at,provider_message_id,data)
         VALUES(?,?,?,?,?,?,?,?,NULL,NULL,NULL,?)`,
      ).run(
        data.id,
        data.dedupe,
        data.contactId,
        data.status,
        data.direction,
        data.channel,
        data.purpose,
        data.createdAt,
        JSON.stringify(data),
      );
      log(data.id, `Risposta ricevuta su ${data.channel}. Nessuna replica automatica inviata.`);
      return data;
    },
    updateOutreachMessage(id, patch) {
      const old = store.outreachMessage(id);
      if (!old) throw new AppError(404, "Messaggio non trovato.");
      const data = { ...old, ...patch, updatedAt: now() };
      db.prepare(
        `UPDATE outreach_messages SET status=?,contact_id=?,channel=?,purpose=?,scheduled_at=?,sent_at=?,provider_message_id=?,data=? WHERE id=?`,
      ).run(
        data.status,
        data.contactId,
        data.channel,
        data.purpose,
        data.scheduledAt,
        data.sentAt,
        data.providerMessageId,
        JSON.stringify(data),
        id,
      );
      return data;
    },
    markOutreachSent(contactId, sentAt) {
      const contact = store.contact(contactId);
      if (contact) store.addConversation(contact, { outbound: sentAt });
      return sentAt;
    },
    conversations: () =>
      db.prepare("SELECT data FROM conversations ORDER BY rowid DESC").all().map(json),
    conversation: (id) =>
      json(db.prepare("SELECT data FROM conversations WHERE id=?").get(id)),
    addConversation(contact, { inbound, outbound }) {
      const existing = store
        .conversations()
        .find((c) => c.contactId === contact.id && c.channel === contact.channel);
      const patch = {};
      if (inbound !== undefined) patch.lastInboundAt = inbound;
      if (outbound !== undefined) patch.lastOutboundAt = outbound;
      if (existing) {
        const data = { ...existing, ...patch, updatedAt: now() };
        db.prepare("UPDATE conversations SET data=? WHERE id=?").run(
          JSON.stringify(data),
          existing.id,
        );
        return data;
      }
      const data = {
        id: randomUUID(),
        contactId: contact.id,
        partnerId: contact.partnerId,
        channel: contact.channel,
        address: contact.address,
        lastInboundAt: inbound ?? null,
        lastOutboundAt: outbound ?? null,
        createdAt: now(),
        updatedAt: now(),
      };
      db.prepare(
        "INSERT INTO conversations(id,contact_id,channel,data) VALUES(?,?,?,?)",
      ).run(data.id, data.contactId, data.channel, JSON.stringify(data));
      return data;
    },
    campaigns: () =>
      db.prepare("SELECT data FROM campaigns ORDER BY rowid DESC").all().map(json),
    campaign: (id) => json(db.prepare("SELECT data FROM campaigns WHERE id=?").get(id)),
    addCampaign(c) {
      const data = {
        ...c,
        id: randomUUID(),
        status: "active",
        createdAt: now(),
        updatedAt: now(),
      };
      db.prepare(
        "INSERT INTO campaigns(id,status,name,created_at,data) VALUES(?,?,?,?,?)",
      ).run(data.id, data.status, data.name, data.createdAt, JSON.stringify(data));
      log(
        data.id,
        `Campagna “${data.name}” creata con ${c.contactIds.length} contatti selezionati. Messaggi in coda, non inviati.`,
      );
      return data;
    },
    updateCampaign(id, patch) {
      const old = store.campaign(id);
      if (!old) throw new AppError(404, "Campagna non trovata.");
      const data = { ...old, ...patch, updatedAt: now() };
      db.prepare("UPDATE campaigns SET status=?,name=?,data=? WHERE id=?").run(
        data.status,
        data.name,
        JSON.stringify(data),
        id,
      );
      return data;
    },
    recordOutreachEvent(channel, type, dedupe, data) {
      const clash = db.prepare("SELECT dedupe FROM outreach_events WHERE dedupe=?").get(dedupe);
      if (clash) return false;
      db.prepare(
        "INSERT INTO outreach_events(dedupe,channel,type,time,data) VALUES(?,?,?,?,?)",
      ).run(dedupe, channel, type, now(), JSON.stringify(data ?? {}));
      return true;
    },
    outreachEvents: (limit = 100) =>
      db
        .prepare("SELECT * FROM outreach_events ORDER BY rowid DESC LIMIT ?")
        .all(limit)
        .map((row) => ({ ...row, data: JSON.parse(row.data) })),
    recoverOutreach() {
      let unknown = 0;
      let restarted = 0;
      for (const m of store.outreachMessages()) {
        if (m.direction !== "outbound") continue;
        if (m.status === "sending") {
          store.updateOutreachMessage(m.id, {
            status: "unknown",
            error:
              "Esito sconosciuto: il processo si è interrotto durante la consegna. Verifica il provider prima di qualsiasi nuovo invio.",
          });
          log(m.id, "Invio interrotto dal riavvio: esito sconosciuto, nessun retry automatico.");
          unknown++;
        } else if (["queued", "approved"].includes(m.status)) {
          store.updateOutreachMessage(m.id, { restarts: (m.restarts || 0) + 1 });
          restarted++;
        }
      }
      if (unknown || restarted)
        log(
          "CONTATTI",
          `Ripristino coda: ${unknown} esiti sconosciuti, ${restarted} messaggi ancora in coda.`,
        );
    },
    close: () => db.close(),
  };
  return store;
}
