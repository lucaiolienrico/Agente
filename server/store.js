import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { defaultKnowledge, duplicateKey, AppError } from "./domain.js";

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
    close: () => db.close(),
  };
  return store;
}
