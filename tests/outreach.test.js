import test from "node:test";
import assert from "node:assert/strict";
import { setTimeout } from "node:timers/promises";
import { createHmac, randomUUID } from "node:crypto";
import { configFromEnv, createApp } from "../server/app.js";
import { createStore } from "../server/store.js";
import { createAgent } from "../server/agent.js";
import { createOutreach } from "../server/outreach.js";
import {
  outreachConfig,
  outreachStatus,
  normalizeAddress,
  isStopRequest,
  addBusinessDays,
  contactSchema,
  templateSchema,
} from "../server/outreach-domain.js";
import { parse } from "../server/domain.js";
import {
  createOutreachChannels,
  parseWhatsAppEvent,
  parseResendEvent,
  verifyMetaSignature,
  verifySvixSignature,
} from "../server/outreach-channels.js";
import {
  config,
  fixture,
  partner,
  outreachFixture,
  outreachConfigFixture,
  mockChannels,
} from "./helpers.js";

const enabledEnv = {
  NODE_ENV: "production",
  APP_ORIGIN: "https://partner.example.org",
  ADMIN_PASSWORD: "password-lunga-di-prova",
  DEV_AUTH_BYPASS: "false",
  OUTREACH_ENABLED: "true",
  RESEND_API_KEY: "re_not_real",
  RESEND_FROM: "partner@petnote.example",
  RESEND_REPLY_TO: "partner@petnote.example",
  RESEND_WEBHOOK_SECRET: "webhook-secret-di-prova-32",
  WA_ACCESS_TOKEN: "wa-not-real",
  WA_PHONE_NUMBER_ID: "100000000000001",
  WA_BUSINESS_ACCOUNT_ID: "100000000000002",
  WA_GRAPH_VERSION: "v23.0",
  WA_APP_SECRET: "app-secret-di-prova",
  WA_VERIFY_TOKEN: "verify-token-di-prova-32",
};

test("invii disattivati per impostazione predefinita e nessun adapter pronto", () => {
  const off = outreachConfig({});
  assert.equal(off.enabled, false);
  const status = outreachStatus({ ...config, outreach: off });
  assert.equal(status.enabled, false);
  assert.deepEqual(status.readyChannels, []);
  const channels = createOutreachChannels(config, off);
  assert.equal(channels.email.ready, false);
  assert.throws(() => channels.email.send({ to: "a@b.example" }), /disattivati/);
  assert.throws(() => channels.whatsapp.send({ to: "+393400000000" }), /disattivati/);
});

test("configurazione contatti rifiuta valori non sicuri o incompleti", () => {
  assert.throws(() => outreachConfig({ OUTREACH_DAILY_LIMIT: "0" }), /tra 1 e 100/);
  assert.throws(() => outreachConfig({ OUTREACH_ENABLED: "yes" }), /true oppure false/);
  assert.throws(() => outreachConfig({ WA_GRAPH_VERSION: "23" }), /vNN\.N/);
  assert.throws(() => outreachConfig({ WA_PHONE_NUMBER_ID: "abc" }), /solo cifre/);
  assert.throws(
    () => outreachConfig({ ...enabledEnv, NODE_ENV: "test" }),
    /non è ammesso con NODE_ENV=test/,
  );
  assert.throws(
    () => outreachConfig({ ...enabledEnv, RESEND_WEBHOOK_SECRET: "corto" }),
    /almeno 16 caratteri/,
  );
  const parsed = outreachConfig(enabledEnv);
  assert.equal(parsed.enabled, true);
  assert.equal(parsed.dailyLimit, 20);
  assert.equal(outreachStatus({ ...config, outreach: parsed }).enabled, true);
  assert.throws(
    () =>
      configFromEnv({
        ...enabledEnv,
        NODE_ENV: "development",
        DEV_AUTH_BYPASS: "true",
        OUTREACH_ENABLED: "true",
      }),
    /accesso protetto/,
  );
  assert.equal(
    configFromEnv({
      ...enabledEnv,
      NODE_ENV: "development",
      APP_ORIGIN: "http://localhost:3000",
    }).outreach.enabled,
    true,
  );
  assert.equal(
    outreachStatus({
      ...config,
      preview: true,
      outreach: outreachConfig({ ...enabledEnv, NODE_ENV: "development" }),
    }).enabled,
    false,
  );
});

test("recapiti, basi di contatto e modelli sono validati per canale", () => {
  assert.equal(normalizeAddress("email", "  Clinica@Example.ORG "), "clinica@example.org");
  assert.throws(() => normalizeAddress("email", "clinica@example"), /non valido/);
  assert.equal(normalizeAddress("whatsapp", "+393401234567"), "+393401234567");
  assert.throws(() => normalizeAddress("whatsapp", "3401234567"), /E\.164/);

  const base = {
    partnerId: randomUUID(),
    channel: "email",
    address: "clinica@example.org",
    basis: "inbound",
    evidence: "Richiesta ricevuta via modulo pubblico il 2026-09-10.",
    obtainedAt: "2026-09-10T09:00:00.000Z",
  };
  assert.equal(parse(contactSchema, base).address, "clinica@example.org");
  assert.throws(
    () => parse(contactSchema, { ...base, evidence: "breve" }),
    /Documenta origine/,
  );
  assert.throws(
    () => parse(contactSchema, { ...base, obtainedAt: "2999-01-01T00:00:00.000Z" }),
    /non può essere futura/,
  );
  assert.throws(
    () => parse(contactSchema, { ...base, expiresAt: "2026-01-01T00:00:00.000Z" }),
    /successiva alla data/,
  );
  assert.throws(() => parse(contactSchema, { ...base, extra: 1 }), /Unrecognized|extra/i);

  assert.throws(
    () =>
      parse(templateSchema, {
        name: "Email senza oggetto",
        channel: "email",
        body: "Testo sufficiently long for validation",
      }),
    /Oggetto obbligatorio/,
  );
  assert.throws(
    () =>
      parse(templateSchema, {
        name: "WhatsApp senza nome",
        channel: "whatsapp",
        body: "Testo sufficiently long for validation",
      }),
    /nome del modello approvato/,
  );
  assert.throws(
    () =>
      parse(templateSchema, {
        name: "WhatsApp con parametri",
        channel: "whatsapp",
        waName: "petnote_partner",
        body: "Ciao {{1}}, testo sufficiently long",
      }),
    /modelli WhatsApp statici/,
  );
  const wa = parse(templateSchema, {
    name: "petnote_partner",
    channel: "whatsapp",
    waName: "petnote_partner",
    body: "Testo statico approvato sufficiently long",
  });
  assert.equal(wa.language, "it");
});

test("solo richieste pertinenti o consenso documentato rendono un contatto raggiungibile", async (t) => {
  const f = await outreachFixture(t);
  const contact = f.addContact();
  assert.equal(f.engine.reachable(contact.id).reachable, true);

  f.store.updateContact(contact.id, { basis: "unknown", evidence: "" });
  assert.match(f.engine.reachable(contact.id).reason, /richiesta pertinente|consenso/i);

  f.store.updateContact(contact.id, {
    basis: "consent",
    evidence: "Consenso documentato il 2026-09-11 via modulo.",
    expiresAt: "2026-09-16T09:00:00.000Z",
  });
  assert.match(f.engine.reachable(contact.id).reason, /scaduta/);

  f.store.updateContact(contact.id, { expiresAt: null, basis: "opt_out" });
  assert.match(f.engine.reachable(contact.id).reason, /Opt-out/);
  assert.equal(f.channels.calls.length, 0);
});

test("anteprima aperta e invii disattivati bloccano ogni consegna", async (t) => {
  const preview = await outreachFixture(t, {});
  const contact = preview.addContact();
  const template = preview.addTemplate();
  preview.store.updatePartner(preview.partnerRecord.id, {
    ...preview.partnerRecord,
    status: "escluso",
  });
  assert.match(preview.engine.reachable(contact.id).reason, /esclusa/);

  const blockedCfg = { ...config, preview: true, outreach: outreachConfigFixture };
  const blockedStore = createStore(":memory:");
  t.after(() => blockedStore.close());
  const blocked = createOutreach({
    store: blockedStore,
    config: blockedCfg,
    outreach: blockedCfg.outreach,
    channels: mockChannels(),
  });
  assert.equal(outreachStatus(blockedCfg).enabled, false);
  const { id: _ignored, createdAt: _c, updatedAt: _u, ...partnerCopy } = preview.partnerRecord;
  const p = blockedStore.addPartner(partnerCopy, { origin: "manual" });
  const c = blockedStore.addContact({
    partnerId: p.id,
    channel: "email",
    address: "clinica@example.org",
    basis: "consent",
    evidence: "Consenso documentato nella fixture isolata.",
    obtainedAt: "2026-09-10T09:00:00.000Z",
    expiresAt: null,
  });
  assert.match(blocked.reachable(c.id).reason, /Anteprima aperta/);
  assert.equal(template.channel, "email");
  assert.equal(contact.channel, "email");
});

test("messaggio approvato viene consegnato una sola volta con esito tracciato", async (t) => {
  const f = await outreachFixture(t);
  const contact = f.addContact();
  const template = f.addTemplate();
  const message = f.engine.createMessage({
    requestId: randomUUID(),
    contactId: contact.id,
    purpose: "initial",
    templateId: template.id,
    subject: "",
    body: "",
    scheduledAt: null,
    confirmed: true,
  });
  assert.equal(message.duplicate, false);
  assert.equal(message.status, "approved");
  assert.equal(f.channels.calls.length, 0, "nessun invio prima del worker");
  await f.settle();
  assert.equal(f.channels.calls.length, 1);
  assert.deepEqual(f.channels.calls[0], {
    channel: "email",
    to: "clinica@example.org",
    subject: template.subject,
    body: template.body,
    idempotencyKey: message.id,
  });
  const sent = f.store.outreachMessage(message.id);
  assert.equal(sent.status, "sent");
  assert.equal(sent.providerMessageId, "resend-1");
  assert.ok(sent.sentAt);
  assert.equal(f.store.outreachSendCount("2026-09-17T00:00:00.000Z"), 1);
  assert.equal(f.engine.status().sentToday, 1);
  assert.equal(f.store.conversations().length, 1);
  await f.settle();
  assert.equal(f.channels.calls.length, 1, "nessun secondo invio automatico");
});

test("testo modificato dopo l’approvazione blocca l’invio", async (t) => {
  const f = await outreachFixture(t);
  const contact = f.addContact();
  const message = f.engine.createMessage({
    requestId: randomUUID(),
    contactId: contact.id,
    purpose: "initial",
    templateId: null,
    subject: "Oggetto approvato",
    body: "Testo approvato nella fixture isolata.",
    scheduledAt: null,
    confirmed: true,
  });
  f.store.updateOutreachMessage(message.id, {
    body: "Testo sostituito dopo l’approvazione.",
  });
  await f.settle();
  const blocked = f.store.outreachMessage(message.id);
  assert.equal(blocked.status, "blocked");
  assert.match(blocked.blockedReason, /approva di nuovo/i);
  assert.equal(f.channels.calls.length, 0);
});

test("coda, duplicati, annullamento e sospensione non producono invii", async (t) => {
  const f = await outreachFixture(t);
  const contact = f.addContact();
  const template = f.addTemplate();

  const queued = f.engine.createMessage(
    {
      requestId: randomUUID(),
      contactId: contact.id,
      purpose: "reply",
      templateId: null,
      subject: "Re: PetNote",
      body: "Risposta revisionata dall’operatore nella fixture.",
      scheduledAt: null,
      confirmed: false,
    },
    { autoApprove: false },
  );
  assert.equal(queued.status, "queued");
  await f.settle();
  assert.equal(f.channels.calls.length, 0, "senza approvazione non si invia");
  assert.equal(f.engine.cancel(queued.id).status, "cancelled");
  assert.throws(() => f.engine.approve(queued.id), /non applicabile/);

  const requestId = randomUUID();
  const first = f.engine.createMessage({
    requestId,
    contactId: contact.id,
    purpose: "initial",
    templateId: template.id,
    confirmed: true,
  });
  const duplicate = f.engine.createMessage({
    requestId,
    contactId: contact.id,
    purpose: "initial",
    templateId: template.id,
    confirmed: true,
  });
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.id, first.id);
  assert.equal(f.store.outreachMessages().filter((m) => m.direction === "outbound").length, 2);
  assert.equal(f.engine.pause(true).paused, true);
  assert.equal(f.store.outreachMessage(first.id).status, "cancelled");
  await f.settle();
  assert.equal(f.channels.calls.length, 0, "la sospensione blocca la consegna");
  assert.throws(
    () =>
      f.engine.createMessage({
        requestId: randomUUID(),
        contactId: contact.id,
        purpose: "initial",
        templateId: template.id,
        confirmed: true,
      }),
    /sospesi|disattivati/i,
  );
});

test("limite giornaliero e orario lavorativo rinviano o bloccano gli invii", async (t) => {
  const f = await outreachFixture(t, { dailyLimit: 1 });
  const contact = f.addContact();
  const template = f.addTemplate();
  f.engine.createMessage({
    requestId: randomUUID(),
    contactId: contact.id,
    purpose: "initial",
    templateId: template.id,
    confirmed: true,
  });
  await f.settle();
  assert.equal(f.channels.calls.length, 1);

  const second = f.engine.createMessage({
    requestId: randomUUID(),
    contactId: contact.id,
    purpose: "reply",
    templateId: null,
    subject: "Re: PetNote",
    body: "Secondo messaggio della fixture isolata di test.",
    scheduledAt: null,
    confirmed: true,
  });
  await f.settle();
  assert.equal(f.channels.calls.length, 1);
  assert.equal(f.store.outreachMessage(second.id).status, "blocked");
  assert.match(f.store.outreachMessage(second.id).blockedReason, /Limite giornaliero/);

  const hours = await outreachFixture(t, { businessHours: true, dailyLimit: 20 });
  const hContact = hours.addContact();
  hours.setTime("2026-09-19T20:00:00.000Z"); // sabato in Italia
  const deferred = hours.engine.createMessage({
    requestId: randomUUID(),
    contactId: hContact.id,
    purpose: "initial",
    templateId: hours.addTemplate().id,
    confirmed: true,
  });
  await hours.settle();
  assert.equal(hours.channels.calls.length, 0);
  assert.equal(hours.store.outreachMessage(deferred.id).status, "blocked");
  assert.match(hours.store.outreachMessage(deferred.id).blockedReason, /orario lavorativo/);
});

test("errore transitorio rinviato, errore permanente senza retry", async (t) => {
  const transient = await outreachFixture(t);
  const contact = transient.addContact();
  const template = transient.addTemplate();
  transient.channels.email.send = async () => {
    const { OutreachError } = await import("../server/outreach-channels.js");
    throw new OutreachError(503, "Provider temporaneamente non disponibile", {
      retryable: true,
    });
  };
  const message = transient.engine.createMessage({
    requestId: randomUUID(),
    contactId: contact.id,
    purpose: "initial",
    templateId: template.id,
    confirmed: true,
  });
  await transient.settle();
  const deferred = transient.store.outreachMessage(message.id);
  assert.equal(deferred.status, "approved");
  assert.match(deferred.error, /Nuovo tentativo programmato/);
  assert.ok(Date.parse(deferred.scheduledAt) > Date.now() - 60000);

  const permanent = await outreachFixture(t);
  const pContact = permanent.addContact();
  const pTemplate = permanent.addTemplate();
  permanent.channels.email.send = async () => {
    const { OutreachError } = await import("../server/outreach-channels.js");
    throw new OutreachError(403, "Dominio mittente non verificato", { retryable: false });
  };
  const pMessage = permanent.engine.createMessage({
    requestId: randomUUID(),
    contactId: pContact.id,
    purpose: "initial",
    templateId: pTemplate.id,
    confirmed: true,
  });
  await permanent.settle();
  const failed = permanent.store.outreachMessage(pMessage.id);
  assert.equal(failed.status, "failed");
  assert.match(failed.error, /Dominio mittente non verificato/);
  await permanent.settle();
  assert.equal(failed.status, "failed", "nessun retry automatico");
});

test("risposta senza identificativo del provider resta a esito sconosciuto", async (t) => {
  const f = await outreachFixture(t);
  const contact = f.addContact();
  f.channels.email.send = async () => ({ status: "sent" });
  const message = f.engine.createMessage({
    requestId: randomUUID(),
    contactId: contact.id,
    purpose: "initial",
    templateId: f.addTemplate().id,
    confirmed: true,
  });
  await f.settle();
  const unknown = f.store.outreachMessage(message.id);
  assert.equal(unknown.status, "unknown");
  assert.match(unknown.error, /esito da verificare/i);
  assert.equal(f.store.outreachSendCount(), 0);
});

function signMeta(payload, secret) {
  return (
    "sha256=" + createHmac("sha256", secret).update(JSON.stringify(payload)).digest("hex")
  );
}
function signSvix(payload, secret, id = randomUUID(), timestamp = String(Math.floor(Date.now() / 1000))) {
  const signature = createHmac("sha256", Buffer.from(secret, "utf8"))
    .update(`${id}.${timestamp}.${JSON.stringify(payload)}`)
    .digest("base64");
  return { "svix-id": id, "svix-timestamp": timestamp, "svix-signature": `v1,${signature}` };
}

test("webhook WhatsApp: firma obbligatoria, risposte registrate, opt-out su opposizione", async (t) => {
  const f = await outreachFixture(t);
  const contact = f.addContact({ channel: "whatsapp", address: "+393401234567" });
  const payload = {
    object: "whatsapp_business_account",
    entry: [
      {
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              messages: [
                {
                  from: "393401234567",
                  id: "wamid.inbound-1",
                  timestamp: "1789000000",
                  type: "text",
                  text: { body: "Vorrei ricevere il materiale informativo." },
                },
              ],
            },
          },
        ],
      },
    ],
  };
  await assert.rejects(
    f.engine.handleWhatsAppWebhook(Buffer.from(JSON.stringify(payload)), {}),
    /Firma webhook/,
  );
  const parsed = parseWhatsAppEvent(payload);
  assert.equal(parsed.address, "+393401234567");
  const result = await f.engine.handleWhatsAppWebhook(
    Buffer.from(JSON.stringify(payload)),
    { "x-hub-signature-256": signMeta(payload, outreachConfigFixture.waAppSecret) },
  );
  assert.equal(result.recorded, true);
  const inbound = f.store.outreachMessages().find((m) => m.direction === "inbound");
  assert.equal(inbound.contactId, contact.id);
  assert.match(inbound.body, /materiale informativo/);
  assert.equal(f.channels.calls.length, 0, "nessuna replica automatica senza campagna");

  const duplicate = await f.engine.handleWhatsAppWebhook(
    Buffer.from(JSON.stringify(payload)),
    { "x-hub-signature-256": signMeta(payload, outreachConfigFixture.waAppSecret) },
  );
  assert.equal(duplicate.duplicate, true);
  assert.equal(f.store.outreachMessages().filter((m) => m.direction === "inbound").length, 1);

  const stopPayload = structuredClone(payload);
  stopPayload.entry[0].changes[0].value.messages[0].id = "wamid.inbound-2";
  stopPayload.entry[0].changes[0].value.messages[0].text.body = "STOP, non contattarmi più.";
  assert.equal(isStopRequest("STOP, non contattarmi più."), true);
  const stop = await f.engine.handleWhatsAppWebhook(
    Buffer.from(JSON.stringify(stopPayload)),
    { "x-hub-signature-256": signMeta(stopPayload, outreachConfigFixture.waAppSecret) },
  );
  assert.equal(stop.optOut, true);
  assert.equal(f.store.contact(contact.id).basis, "opt_out");
  assert.equal(f.store.partner(contact.partnerId).contactBasis, "opt_out");
  assert.match(f.engine.reachable(contact.id).reason, /Opt-out/);

  const unknown = structuredClone(payload);
  unknown.entry[0].changes[0].value.messages[0].id = "wamid.inbound-3";
  unknown.entry[0].changes[0].value.messages[0].from = "393409999999";
  const ignored = await f.engine.handleWhatsAppWebhook(Buffer.from(JSON.stringify(unknown)), {
    "x-hub-signature-256": signMeta(unknown, outreachConfigFixture.waAppSecret),
  });
  assert.equal(ignored.unknownSender, true);
});

test("webhook WhatsApp: esiti di consegna aggiornano il messaggio, firma errata respinta", async (t) => {
  const f = await outreachFixture(t);
  const contact = f.addContact({ channel: "whatsapp", address: "+393401234567" });
  const template = f.addTemplate({
    name: "petnote_partner",
    channel: "whatsapp",
    subject: "",
    waName: "petnote_partner",
    body: "Messaggio statico approvato nella fixture isolata.",
  });
  const message = f.engine.createMessage({
    requestId: randomUUID(),
    contactId: contact.id,
    purpose: "initial",
    templateId: template.id,
    confirmed: true,
  });
  await f.settle();
  assert.equal(f.channels.calls[0].channel, "whatsapp");
  assert.deepEqual(f.channels.calls[0].template, { name: "petnote_partner", language: "it" });
  assert.equal(f.store.outreachMessage(message.id).providerMessageId, "wamid-1");

  const statusPayload = {
    entry: [
      {
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              statuses: [
                { id: "wamid-1", status: "delivered", timestamp: "1789000100", recipient_id: "393401234567" },
              ],
            },
          },
        ],
      },
    ],
  };
  await f.engine.handleWhatsAppWebhook(Buffer.from(JSON.stringify(statusPayload)), {
    "x-hub-signature-256": signMeta(statusPayload, outreachConfigFixture.waAppSecret),
  });
  assert.equal(f.store.outreachMessage(message.id).status, "delivered");

  const failedPayload = structuredClone(statusPayload);
  failedPayload.entry[0].changes[0].value.statuses[0].status = "failed";
  failedPayload.entry[0].changes[0].value.statuses[0].errors = [{ title: "Numero non registrato" }];
  await f.engine.handleWhatsAppWebhook(Buffer.from(JSON.stringify(failedPayload)), {
    "x-hub-signature-256": signMeta(failedPayload, outreachConfigFixture.waAppSecret),
  });
  const failed = f.store.outreachMessage(message.id);
  assert.equal(failed.status, "failed");
  assert.match(failed.error, /Numero non registrato/);

  await assert.rejects(
    f.engine.handleWhatsAppWebhook(Buffer.from(JSON.stringify(statusPayload)), {
      "x-hub-signature-256": signMeta(statusPayload, "secret-sbagliato"),
    }),
    /Firma webhook/,
  );
  assert.equal(verifyMetaSignature(Buffer.from("{}"), "sha256=zz", "secret"), false);
});

test("webhook Resend: firma Svix, email ricevuta con opt-out ed eventi di consegna", async (t) => {
  const f = await outreachFixture(t);
  const contact = f.addContact();
  const secret = outreachConfigFixture.resendWebhookSecret;
  const received = {
    type: "email.received",
    created_at: "2026-09-17T10:05:00.000Z",
    data: {
      email_id: "mail-1",
      from: "clinica@example.org",
      to: ["partner@petnote.example"],
      subject: "Re: PetNote",
    },
  };
  await assert.rejects(
    f.engine.handleResendWebhook(Buffer.from(JSON.stringify(received)), {}),
    /Firma webhook/,
  );
  const stale = signSvix(received, secret, randomUUID(), String(Math.floor(Date.now() / 1000) - 900));
  assert.equal(verifySvixSignature(Buffer.from(JSON.stringify(received)), stale, secret), false);

  const result = await f.engine.handleResendWebhook(
    Buffer.from(JSON.stringify(received)),
    signSvix(received, secret),
  );
  assert.equal(result.recorded, true);
  const inbound = f.store.outreachMessages().find((m) => m.direction === "inbound");
  assert.equal(inbound.contactId, contact.id);
  assert.match(inbound.body, /fixture isolata/);
  assert.equal(inbound.subject, "Re: PetNote");

  const stop = {
    type: "email.received",
    created_at: "2026-09-17T10:06:00.000Z",
    data: { email_id: "mail-2", from: "clinica@example.org", subject: "Stop", },
  };
  const stopBody = "Grazie ma non mi interessa, cancellami dalla lista.";
  f.channels.email.fetchReceived = async () => stopBody;
  await f.engine.handleResendWebhook(Buffer.from(JSON.stringify(stop)), signSvix(stop, secret));
  assert.equal(f.store.contact(contact.id).basis, "opt_out");
  assert.equal(isStopRequest(stopBody), true);

  const template = f.addTemplate();
  // Una struttura diversa: l’opt-out della prima non può rendere contattabile la seconda.
  const secondPartner = f.store.addPartner(
    {
      company: "Pet Shop Fixture Due",
      segment: "pet_shop",
      city: "Bari",
      region: "Puglia",
      sourceUrl: "https://example.org/pet-shop",
      evidence: "Fixture isolata dei test automatici.",
      contactEmail: "altra-clinica@example.org",
      contactBasis: "consent",
      contactEvidence: "Consenso documentato via modulo il 2026-09-12.",
      status: "qualificato",
      notes: "",
    },
    { origin: "manual" },
  );
  const other = f.addContact({
    partnerId: secondPartner.id,
    channel: "email",
    address: "altra-clinica@example.org",
    basis: "consent",
    evidence: "Consenso documentato via modulo il 2026-09-12 per comunicazioni PetNote.",
  });
  const message = f.engine.createMessage({
    requestId: randomUUID(),
    contactId: other.id,
    purpose: "initial",
    templateId: template.id,
    confirmed: true,
  });
  await f.settle();
  assert.equal(f.store.outreachMessage(message.id).status, "sent");

  const bounced = {
    type: "email.bounced",
    created_at: "2026-09-17T10:10:00.000Z",
    data: { email_id: "resend-1" },
  };
  await f.engine.handleResendWebhook(Buffer.from(JSON.stringify(bounced)), signSvix(bounced, secret));
  const failed = f.store.outreachMessage(message.id);
  assert.equal(failed.status, "failed");
  assert.match(failed.error, /email\.bounced/);
  assert.equal(parseResendEvent({ type: "domain.created", data: {} }), null);
  assert.equal(parseWhatsAppEvent({ entry: [{ changes: [{ value: {} }] }] }), null);
});

test("campagna: solo contatti autorizzati, promemoria programmato e nessuna esplosione di invii", async (t) => {
  const f = await outreachFixture(t);
  const authorized = f.addContact();
  const notAuthorized = f.addContact({
    channel: "email",
    address: "senza-consenso@example.org",
    basis: "unknown",
    evidence: "",
  });
  const initial = f.addTemplate();
  const followup = f.addTemplate({
    name: "Promemoria PetNote",
    subject: "Promemoria: programma partner PetNote",
    body: "Promemoria approvato nella fixture isolata di test.",
  });
  const campaign = f.engine.createCampaign({
    requestId: randomUUID(),
    name: "Puglia settembre",
    contactIds: [authorized.id, notAuthorized.id, randomUUID()],
    initialTemplateId: initial.id,
    followupTemplateId: followup.id,
    replyTemplateId: null,
    followupDays: 3,
    confirmed: true,
  });
  assert.deepEqual(campaign.contactIds, [authorized.id]);
  assert.equal(campaign.rejected.length, 2);
  assert.equal(campaign.queued, 2);
  await f.settle();
  assert.equal(f.channels.calls.length, 1, "solo il primo messaggio è inviabile ora");
  const messages = f.store.outreachMessages().filter((m) => m.direction === "outbound");
  assert.equal(messages.length, 2);
  const reminder = messages.find((m) => m.purpose === "followup");
  assert.equal(reminder.status, "approved");
  assert.ok(Date.parse(reminder.scheduledAt) > Date.now());
  assert.equal(addBusinessDays(new Date("2026-09-17T10:00:00Z"), 3).slice(0, 10), "2026-09-22");

  assert.throws(
    () =>
      f.engine.createCampaign({
        requestId: randomUUID(),
        name: "Campagna senza autorizzazioni",
        contactIds: [notAuthorized.id],
        initialTemplateId: initial.id,
        confirmed: true,
      }),
    /Nessun contatto autorizzato/,
  );
});

test("API: contatti, modelli, messaggi e webhook seguono autenticazione e stato", async (t) => {
  const store = createStore(":memory:");
  const cfg = { ...config, outreach: { ...outreachConfigFixture } };
  const channels = mockChannels();
  const agent = createAgent(
    store,
    { research: async () => ({ partners: [], sources: [], discarded: 0, usage: {} }), draft: async () => ({ subject: "a", body: "b", usage: {} }) },
    cfg,
  );
  const outreach = createOutreach({
    store,
    config: cfg,
    outreach: cfg.outreach,
    channels,
    tickMs: 5,
  });
  const app = createApp({ store, agent, config: cfg, outreach, dist: "/missing-test-build" });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(() => {
    outreach.shutdown();
    agent.shutdown();
    server.close();
    server.closeAllConnections();
    store.close();
  });
  let cookie = "";
  const call = async (path, { method = "GET", body, headers = {} } = {}) =>
    fetch(base + "/api" + path, {
      method,
      headers: {
        ...(cookie ? { Cookie: cookie } : {}),
        ...(body !== undefined ? { "Content-Type": "application/json", Origin: cfg.origin } : {}),
        ...headers,
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

  assert.equal((await call("/outreach/status")).status, 401);
  const login = await call("/login", { method: "POST", body: { password: cfg.password } });
  cookie = login.headers.get("set-cookie").split(";")[0];
  const status = await (await call("/outreach/status")).json();
  assert.equal(status.enabled, true);
  assert.equal(status.paused, false);
  assert.equal(status.sentToday, 0);
  assert.deepEqual(status.channels.map((c) => c.channel), ["email", "whatsapp"]);
  assert.ok(!JSON.stringify(status).includes(outreachConfigFixture.resendKey));
  assert.ok(!JSON.stringify(status).includes(outreachConfigFixture.waToken));

  const partnerRecord = store.addPartner(
    {
      ...partner,
      company: "Clinica API Fixture",
      segment: "veterinario",
      city: "Bari",
      region: "Puglia",
      sourceUrl: "https://example.org/clinica",
      evidence: "Fixture isolata dei test automatici.",
      contactEmail: "clinica-api@example.org",
      contactBasis: "inbound",
      contactEvidence: "Richiesta ricevuta via modulo pubblico il 2026-09-10.",
      status: "qualificato",
      notes: "",
    },
    { origin: "manual" },
  );
  const created = await call("/outreach/contacts", {
    method: "POST",
    body: {
      partnerId: partnerRecord.id,
      channel: "email",
      address: "clinica-api@example.org",
      basis: "inbound",
      evidence: "Richiesta ricevuta via modulo pubblico il 2026-09-10.",
      obtainedAt: "2026-09-10T09:00:00.000Z",
      expiresAt: null,
    },
  });
  assert.equal(created.status, 201);
  const contact = await created.json();
  assert.equal(contact.address, "clinica-api@example.org");
  const duplicateContact = await call("/outreach/contacts", {
    method: "POST",
    body: {
      partnerId: partnerRecord.id,
      channel: "email",
      address: "clinica-api@example.org",
      basis: "inbound",
      evidence: "Richiesta ricevuta via modulo pubblico il 2026-09-10.",
      obtainedAt: "2026-09-10T09:00:00.000Z",
      expiresAt: null,
    },
  });
  assert.equal(duplicateContact.status, 409);

  const templateResponse = await call("/outreach/templates", {
    method: "POST",
    body: {
      name: "Presentazione API",
      channel: "email",
      subject: "PetNote: programma partner gratuito",
      body: "Testo approvato nella fixture isolata dei test API.",
    },
  });
  assert.equal(templateResponse.status, 201);
  const template = await templateResponse.json();

  const messageResponse = await call("/outreach/messages", {
    method: "POST",
    body: {
      requestId: randomUUID(),
      contactId: contact.id,
      purpose: "initial",
      templateId: template.id,
      confirmed: true,
    },
  });
  assert.equal(messageResponse.status, 201);
  const message = await messageResponse.json();
  assert.equal(message.status, "approved");

  // confirmed:false crea un messaggio in coda, non approvato automaticamente.
  const queuedResponse = await call("/outreach/messages", {
    method: "POST",
    body: {
      requestId: randomUUID(),
      contactId: contact.id,
      purpose: "reply",
      templateId: null,
      subject: "Re: PetNote",
      body: "Risposta lasciata in coda dalla prova API.",
      scheduledAt: null,
      confirmed: false,
    },
  });
  assert.equal(queuedResponse.status, 201);
  const queuedMessage = await queuedResponse.json();
  assert.equal(queuedMessage.status, "queued");

  const state = await (await call("/state")).json();
  assert.equal(state.outreach.enabled, true);
  assert.equal(state.contacts.length, 1);
  assert.equal(state.templates.length, 1);
  assert.ok(!JSON.stringify(state).includes(outreachConfigFixture.waAppSecret));

  outreach.start();
  for (let i = 0; i < 100 && !outreach.idle(); i++) await setTimeout(10);
  const sent = await (await call("/outreach/messages")).json();
  assert.equal(
    sent.find((m) => m.id === message.id).status,
    "sent",
    "il messaggio approvato viene consegnato",
  );
  assert.equal(
    sent.find((m) => m.id === queuedMessage.id).status,
    "queued",
    "il messaggio non approvato resta in coda",
  );
  assert.equal(channels.calls.length, 1);

  const pauseResponse = await call("/outreach/pause", { method: "POST", body: { paused: true } });
  assert.equal((await pauseResponse.json()).paused, true);
  assert.equal((await call("/outreach/pause", { method: "POST", body: {} })).status, 400);

  const webhookPayload = {
    type: "email.delivered",
    created_at: "2026-09-17T10:20:00.000Z",
    data: { email_id: "resend-1" },
  };
  const unsigned = await fetch(base + "/api/webhooks/resend", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(webhookPayload),
  });
  assert.equal(unsigned.status, 401);
  const signed = await fetch(base + "/api/webhooks/resend", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...signSvix(webhookPayload, outreachConfigFixture.resendWebhookSecret) },
    body: JSON.stringify(webhookPayload),
  });
  assert.equal(signed.status, 200, "webhook firmato accettato anche con invii sospesi");
  await call("/outreach/pause", { method: "POST", body: { paused: false } });
  const conversations = await (await call("/outreach/conversations")).json();
  assert.ok(conversations.events.some((e) => e.type === "email.delivered"));

  const waVerify = await fetch(
    base +
      `/api/webhooks/whatsapp?hub.mode=subscribe&hub.challenge=12345&hub.verify_token=${encodeURIComponent(outreachConfigFixture.waVerifyToken)}`,
  );
  assert.equal(waVerify.status, 200);
  assert.equal(await waVerify.text(), "12345");
  const waWrong = await fetch(
    base + "/api/webhooks/whatsapp?hub.mode=subscribe&hub.challenge=12345&hub.verify_token=sbagliato",
  );
  assert.equal(waWrong.status, 403);
});

test("senza OUTREACH_ENABLED nessun messaggio può essere messo in coda", async () => {
  const store = createStore(":memory:");
  const cfg = { ...config, outreach: outreachConfig({}) };
  const engine = createOutreach({
    store,
    config: cfg,
    outreach: cfg.outreach,
    channels: createOutreachChannels(cfg, cfg.outreach),
  });
  const p = store.addPartner(
    {
      ...partner,
      company: "Clinica senza invii",
      status: "qualificato",
      contactBasis: "inbound",
      contactEmail: "clinica@example.org",
      contactEvidence: "Richiesta ricevuta via modulo pubblico il 2026-09-10.",
    },
    { origin: "manual" },
  );
  const contact = store.addContact({
    partnerId: p.id,
    channel: "email",
    address: "clinica@example.org",
    basis: "inbound",
    evidence: "Richiesta ricevuta via modulo pubblico il 2026-09-10.",
    obtainedAt: "2026-09-10T09:00:00.000Z",
    expiresAt: null,
  });
  const template = store.addTemplate({
    name: "Modello senza invii",
    channel: "email",
    subject: "PetNote",
    body: "Testo della fixture isolata senza invii esterni.",
    waName: "",
    language: "it",
  });
  assert.equal(engine.status().enabled, false);
  assert.throws(
    () =>
      engine.createMessage({
        requestId: randomUUID(),
        contactId: contact.id,
        purpose: "initial",
        templateId: template.id,
        confirmed: true,
      }),
    /disattivati/,
  );
  assert.throws(
    () =>
      engine.createCampaign({
        requestId: randomUUID(),
        name: "Campagna bloccata",
        contactIds: [contact.id],
        initialTemplateId: template.id,
        confirmed: true,
      }),
    /disattivati/,
  );
  assert.match(engine.reachable(contact.id).reason, /disattivati/);
  assert.equal(store.outreachMessages().length, 0);
  store.close();
});
