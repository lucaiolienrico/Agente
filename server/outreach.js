import { createHash } from "node:crypto";
import { AppError } from "./domain.js";
import {
  addBusinessDays,
  isBusinessHours,
  isStopRequest,
  normalizeAddress,
  outreachStatus,
} from "./outreach-domain.js";
import {
  OutreachError,
  parseResendEvent,
  parseWhatsAppEvent,
  verifyMetaSignature,
  verifySvixSignature,
} from "./outreach-channels.js";

const PENDING = ["queued", "approved"];

// One message at a time, no automatic retry after a delivery attempt,
// and a full authorization re-check immediately before handing it to a provider.
export function createOutreach({
  store,
  config,
  channels,
  outreach,
  now = () => new Date(),
  tickMs = 15000,
}) {
  let busy = false;
  let stopped = true;
  let controller = null;
  let activeId = null;
  let timer = null;
  const statusOf = () => outreachStatus(config);
  const startOfDay = (at) => at.toISOString().slice(0, 10) + "T00:00:00.000Z";
  const sentToday = () => store.outreachSendCount(startOfDay(now()));

  function activeChannel(channel) {
    const adapter = channel === "email" ? channels.email : channels.whatsapp;
    if (!adapter?.ready)
      throw new OutreachError(
        503,
        `Canale ${channel} non configurato sul server: nessun messaggio consegnato.`,
      );
    return adapter;
  }

  // Returns null when the contact may be messaged, otherwise a human-readable block.
  function reachability(message, at = now()) {
    const state = statusOf();
    if (state.preview)
      return "Anteprima aperta: gli invii esterni sono bloccati. Nessun messaggio simulato.";
    if (!state.enabled)
      return "Invii esterni disattivati sul server (OUTREACH_ENABLED=false).";
    if (store.isOutreachPaused()) return "Invii sospesi dall’amministratore.";
    const adapter = message.channel === "email" ? channels.email : channels.whatsapp;
    if (!adapter?.ready)
      return `Canale ${message.channel} non configurato sul server.`;
    const contact = store.contact(message.contactId);
    if (!contact) return "Contatto eliminato o non trovato.";
    if (contact.basis === "opt_out") return "Opt-out registrato sul contatto.";
    if (!["inbound", "consent"].includes(contact.basis))
      return "Manca una richiesta pertinente o un consenso documentato per questo canale.";
    if (String(contact.evidence || "").trim().length < 10)
      return "Base di contatto non documentata a sufficienza.";
    if (contact.expiresAt && Date.parse(contact.expiresAt) <= at.getTime())
      return "Autorizzazione scaduta: serve una nuova richiesta o un nuovo consenso documentato.";
    const partner = store.partner(contact.partnerId);
    if (!partner) return "Struttura non trovata.";
    if (partner.status === "escluso") return "Struttura esclusa dall’archivio.";
    if (partner.contactBasis === "opt_out") return "Struttura in opt-out.";
    if (message.status === "approved" && message.approvedContentHash !== contentHash(message))
      return "Il testo è cambiato dopo l’approvazione: approva di nuovo il messaggio.";
    if (sentToday() >= state.dailyLimit)
      return `Limite giornaliero di invii raggiunto (${state.dailyLimit} per giorno UTC).`;
    if (
      state.businessHours &&
      message.purpose !== "reply" &&
      !isBusinessHours(at)
    )
      return "Fuori dall’orario lavorativo italiano (lun–ven 9–18): l’invio è rinviato.";
    return null;
  }

  function contentHash(message) {
    return createHash("sha256")
      .update(`${message.subject}\u0000${message.body}\u0000${message.templateId || ""}`)
      .digest("hex");
  }

  async function deliver(message) {
    const contact = store.contact(message.contactId);
    const adapter = activeChannel(message.channel);
    const payload =
      message.channel === "email"
        ? {
            to: contact.address,
            subject: message.subject,
            body: message.body,
            idempotencyKey: message.id,
          }
        : {
            to: contact.address,
            body: message.body,
            ...(message.template
              ? {
                  template: {
                    name: message.template.waName,
                    language: message.template.language,
                  },
                }
              : {}),
          };
    return adapter.send(payload, controller.signal);
  }

  function processNext() {
    if (stopped || busy) return false;
    const at = now();
    const candidates = store
      .outreachMessages()
      .filter(
        (m) =>
          m.direction === "outbound" &&
          m.status === "approved" &&
          (!m.scheduledAt || Date.parse(m.scheduledAt) <= at.getTime()),
      )
      .sort(
        (a, b) =>
          Date.parse(a.scheduledAt || a.createdAt) - Date.parse(b.scheduledAt || b.createdAt),
      );
    const message = candidates[0];
    if (!message) return false;
    const blocked = reachability(message, at);
    if (blocked) {
      // Not a failure: keep the decision visible and let the operator act.
      if (message.purpose === "followup") {
        store.updateOutreachMessage(message.id, {
          status: "cancelled",
          blockedReason: blocked,
          error: blocked,
        });
        store.log(message.id, `Promemoria annullato: ${blocked}`);
      } else {
        store.updateOutreachMessage(message.id, { status: "blocked", blockedReason: blocked });
        store.log(message.id, `Invio bloccato: ${blocked}`);
      }
      return true;
    }
    busy = true;
    activeId = message.id;
    controller = new AbortController();
    store.updateOutreachMessage(message.id, {
      status: "sending",
      attempts: (message.attempts || 0) + 1,
      blockedReason: null,
    });
    deliver(message)
      .then((result) => finish(message.id, result))
      .catch((error) => fail(message.id, error))
      .finally(() => {
        busy = false;
        activeId = null;
        controller = null;
        if (!stopped) schedule();
      });
    return true;
  }

  function finish(id, result) {
    if (!result?.providerMessageId) {
      store.updateOutreachMessage(id, {
        status: "unknown",
        error:
          "Il provider non ha restituito un identificativo valido: esito da verificare, nessun nuovo invio automatico.",
      });
      store.log(id, "Esito sconosciuto: identificativo del provider mancante.");
      return;
    }
    const data = store.updateOutreachMessage(id, {
      status: "sent",
      providerMessageId: result.providerMessageId,
      provider: result.provider || null,
      sentAt: now().toISOString(),
      error: null,
    });
    store.markOutreachSent(data.contactId, data.sentAt);
    store.log(
      id,
      `Messaggio ${data.channel} accettato dal provider (${data.provider || "esterno"}). La consegna non è ancora confermata.`,
    );
  }

  function fail(id, error) {
    const current = store.outreachMessage(id);
    const retryable = error instanceof OutreachError && error.retryable;
    const message =
      error instanceof AppError || error instanceof OutreachError
        ? error.message
        : "Invio non completato. Controlla la configurazione del canale.";
    if (retryable && (current?.attempts || 0) < 2) {
      store.updateOutreachMessage(id, {
        status: "approved",
        scheduledAt: addBusinessDays(now(), 1),
        error: `${message} Nuovo tentativo programmato (solo errori transitori).`,
      });
      store.log(id, `Errore transitorio del provider. Rinviato: ${message}`);
      return;
    }
    store.updateOutreachMessage(id, { status: "failed", error: message });
    store.log(id, `Invio non riuscito: ${message} Nessun messaggio dichiarato come consegnato.`);
  }

  function schedule() {
    if (stopped) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        while (!stopped && processNext()) {
          /* drain one message per iteration */
        }
      } catch (error) {
        store.log("CONTATTI", `Coda invii interrotta: ${error.message}`);
      }
      schedule();
    }, tickMs);
    timer.unref?.();
  }

  function loadTemplate(templateId, channel) {
    if (!templateId) return null;
    const template = store.template(templateId);
    if (!template) throw new AppError(404, "Modello non trovato.");
    if (template.channel !== channel)
      throw new AppError(409, "Il modello appartiene a un altro canale.");
    return template;
  }

  function requireContact(contactId) {
    const contact = store.contact(contactId);
    if (!contact) throw new AppError(404, "Contatto non trovato.");
    return contact;
  }

  function buildMessage(input, contact, autoApprove) {
    const template = loadTemplate(input.templateId, contact.channel);
    const subject = input.subject || template?.subject || "";
    const body = input.body || template?.body || "";
    if (contact.channel === "email" && !subject.trim())
      throw new AppError(400, "Oggetto obbligatorio per un messaggio email.");
    if (!body.trim())
      throw new AppError(
        400,
        "Testo obbligatorio: usa un modello approvato oppure scrivi il messaggio.",
      );
    if (contact.channel === "whatsapp" && !template && body.length > 1024)
      throw new AppError(
        409,
        "Senza un modello approvato da Meta il testo WhatsApp è limitato a 1024 caratteri e vale solo dentro la finestra di 24 ore.",
      );
    const scheduledAt =
      input.scheduledAt ||
      (input.purpose === "followup"
        ? addBusinessDays(now(), 3)
        : now().toISOString());
    const { message, duplicate } = store.addOutreachMessage({
      requestId: input.requestId,
      contactId: contact.id,
      partnerId: contact.partnerId,
      channel: contact.channel,
      purpose: input.purpose,
      templateId: template?.id || null,
      template:
        contact.channel === "whatsapp" && template
          ? { waName: template.waName, language: template.language }
          : null,
      address: contact.address,
      subject,
      body,
      scheduledAt,
      campaignId: input.campaignId || null,
    });
    if (duplicate) return { message, duplicate: true };
    if (autoApprove) {
      const blocked = reachability(message);
      if (blocked) {
        store.updateOutreachMessage(message.id, {
          status: "blocked",
          blockedReason: blocked,
        });
        store.log(message.id, `Invio bloccato prima dell’approvazione: ${blocked}`);
      } else {
        store.updateOutreachMessage(message.id, {
          status: "approved",
          approvedAt: now().toISOString(),
          approvedContentHash: contentHash(message),
        });
        store.log(message.id, "Messaggio approvato dall’amministratore: in coda per l’invio.");
      }
    }
    return { message: store.outreachMessage(message.id), duplicate: false };
  }

  const outreachApi = {
    status: () => ({
      ...statusOf(),
      paused: store.isOutreachPaused(),
      dailyLimit: statusOf().dailyLimit,
      sentToday: sentToday(),
      counts: countMessages(),
    }),
    reachable(contactId, messageId = null) {
      const contact = requireContact(contactId);
      const message = messageId
        ? store.outreachMessage(messageId)
        : {
            contactId: contact.id,
            channel: contact.channel,
            purpose: "initial",
            status: "queued",
            subject: "",
            body: "",
            templateId: null,
          };
      const reason = reachability(message);
      return { contactId, channel: contact.channel, reachable: !reason, reason };
    },
    addContact(input) {
      const partner = store.partner(input.partnerId);
      if (!partner) throw new AppError(404, "Struttura non trovata.");
      const address = normalizeAddress(input.channel, input.address);
      if (input.channel === "email" && partner.contactEmail && partner.contactEmail !== address)
        store.log(
          partner.id,
          "Attenzione: il recapito email del contatto differisce da quello in scheda struttura.",
        );
      return store.addContact({ ...input, address });
    },
    updateContact(id, input) {
      const contact = requireContact(id);
      const partner = store.partner(input.partnerId);
      if (!partner) throw new AppError(404, "Struttura non trovata.");
      const address = normalizeAddress(input.channel, input.address);
      const clash = store.findContact(input.channel, address);
      if (clash && clash.id !== id)
        throw new AppError(409, "Esiste già un contatto con questo canale e recapito.");
      if (input.basis === "opt_out" && contact.basis !== "opt_out")
        store.updatePartner(partner.id, {
          ...partner,
          contactBasis: "opt_out",
          contactEvidence:
            partner.contactEvidence ||
            `Opt-out registrato sul contatto ${contact.channel} il ${now().toISOString().slice(0, 10)}.`,
        });
      return store.updateContact(id, { ...input, address });
    },
    addTemplate: (input) => store.addTemplate(input),
    updateTemplate: (id, input) => store.updateTemplate(id, input),
    createMessage(input, { autoApprove = true } = {}) {
      if (!statusOf().enabled)
        throw new AppError(
          409,
          "Invii esterni disattivati sul server. Nessun messaggio può essere messo in coda per la consegna.",
        );
      if (store.isOutreachPaused())
        throw new AppError(409, "Invii sospesi dall’amministratore: riattivali prima di accodare messaggi.");
      const contact = requireContact(input.contactId);
      const { message, duplicate } = buildMessage(input, contact, autoApprove);
      if (!duplicate) schedule();
      return { ...message, duplicate };
    },
    approve(id) {
      const message = store.outreachMessage(id);
      if (!message) throw new AppError(404, "Messaggio non trovato.");
      if (message.direction !== "outbound")
        throw new AppError(409, "Solo i messaggi in uscita possono essere approvati.");
      if (!["queued", "blocked", "failed"].includes(message.status))
        throw new AppError(409, `Stato ${message.status}: approvazione non applicabile.`);
      const blocked = reachability(message);
      if (blocked) {
        store.updateOutreachMessage(id, { status: "blocked", blockedReason: blocked });
        throw new AppError(409, blocked);
      }
      const data = store.updateOutreachMessage(id, {
        status: "approved",
        approvedAt: now().toISOString(),
        approvedContentHash: contentHash(message),
        error: null,
        blockedReason: null,
        scheduledAt:
          message.purpose === "reply" &&
          message.scheduledAt &&
          Date.parse(message.scheduledAt) < now().getTime()
            ? now().toISOString()
            : message.scheduledAt,
      });
      store.log(
        id,
        `Messaggio ${data.channel} approvato: consegna al provider possibile entro i limiti configurati.`,
      );
      schedule();
      return data;
    },
    cancel(id) {
      const message = store.outreachMessage(id);
      if (!message) throw new AppError(404, "Messaggio non trovato.");
      if (!PENDING.includes(message.status) && message.status !== "blocked")
        throw new AppError(
          409,
          "Il messaggio è già stato consegnato al provider oppure è terminato: non è annullabile.",
        );
      const data = store.updateOutreachMessage(id, { status: "cancelled" });
      store.log(id, "Messaggio annullato prima della consegna. Nessun invio esterno.");
      return data;
    },
    createCampaign(input) {
      if (!statusOf().enabled)
        throw new AppError(409, "Invii esterni disattivati sul server.");
      if (store.isOutreachPaused())
        throw new AppError(409, "Invii sospesi dall’amministratore.");
      const initial = store.template(input.initialTemplateId);
      if (!initial) throw new AppError(404, "Modello iniziale non trovato.");
      const followup = input.followupTemplateId
        ? store.template(input.followupTemplateId)
        : null;
      if (input.followupTemplateId && !followup)
        throw new AppError(404, "Modello di promemoria non trovato.");
      const reply = input.replyTemplateId ? store.template(input.replyTemplateId) : null;
      if (input.replyTemplateId && !reply)
        throw new AppError(404, "Modello di risposta non trovato.");
      const contacts = [];
      const rejected = [];
      for (const id of new Set(input.contactIds)) {
        const contact = store.contact(id);
        if (!contact) {
          rejected.push({ contactId: id, reason: "Contatto non trovato." });
          continue;
        }
        if (contact.channel !== initial.channel) {
          rejected.push({ contactId: id, reason: "Canale diverso dal modello iniziale." });
          continue;
        }
        const message = {
          contactId: id,
          channel: contact.channel,
          purpose: "initial",
          status: "queued",
          subject: initial.subject,
          body: initial.body,
          templateId: initial.id,
        };
        const reason = reachability(message);
        if (reason) rejected.push({ contactId: id, reason });
        else contacts.push(contact);
      }
      if (!contacts.length)
        throw new AppError(
          409,
          `Nessun contatto autorizzato per questa campagna. ${rejected[0]?.reason || ""}`,
        );
      const campaign = store.addCampaign({
        requestId: input.requestId,
        name: input.name,
        channel: initial.channel,
        contactIds: contacts.map((c) => c.id),
        rejected,
        initialTemplateId: initial.id,
        followupTemplateId: followup?.id || null,
        replyTemplateId: reply?.id || null,
        followupDays: input.followupDays,
        createdBy: "admin",
      });
      let queued = 0;
      let duplicates = 0;
      for (const contact of contacts) {
        const first = buildMessage(
          {
            requestId: input.requestId,
            contactId: contact.id,
            purpose: "initial",
            templateId: initial.id,
            campaignId: campaign.id,
          },
          contact,
          true,
        );
        first.duplicate ? duplicates++ : queued++;
        if (followup) {
          const follow = buildMessage(
            {
              requestId: input.requestId,
              contactId: contact.id,
              purpose: "followup",
              templateId: followup.id,
              campaignId: campaign.id,
              scheduledAt: addBusinessDays(now(), input.followupDays),
            },
            contact,
            true,
          );
          if (!follow.duplicate) queued++;
        }
      }
      store.log(
        campaign.id,
        `Campagna “${campaign.name}”: ${queued} messaggi in coda, ${duplicates} duplicati ignorati, ${rejected.length} contatti esclusi. Ogni invio resta soggetto a limiti e verifiche.`,
      );
      schedule();
      return { ...campaign, queued, duplicates };
    },
    pause(value) {
      store.setOutreachPaused(value);
      if (value) {
        let cancelled = 0;
        for (const m of store
          .outreachMessages()
          .filter((x) => x.direction === "outbound" && PENDING.includes(x.status))) {
          store.updateOutreachMessage(m.id, {
            status: "cancelled",
            blockedReason: "Invii sospesi dall’amministratore.",
          });
          cancelled++;
        }
        if (cancelled)
          store.log("CONTATTI", `Sospensione: ${cancelled} messaggi in coda annullati.`);
      }
      return { paused: store.isOutreachPaused() };
    },
    async handleWhatsAppVerification(query) {
      const state = statusOf();
      const mode = String(query?.["hub.mode"] || "");
      const challenge = String(query?.["hub.challenge"] || "");
      const token = String(query?.["hub.verify_token"] || "");
      if (!state.enabled || mode !== "subscribe")
        throw new AppError(403, "Webhook WhatsApp non attivo su questo server.");
      if (!outreach.waVerifyToken || token !== outreach.waVerifyToken)
        throw new AppError(403, "Token di verifica non corrispondente.");
      store.log("CONTATTI", "Verifica webhook WhatsApp riuscita.");
      return challenge;
    },
    async handleWhatsAppWebhook(rawBody, headers) {
      const state = statusOf();
      if (!state.enabled)
        throw new AppError(403, "Webhook WhatsApp non attivo su questo server.");
      if (!verifyMetaSignature(rawBody, headers["x-hub-signature-256"], outreach.waAppSecret))
        throw new AppError(401, "Firma webhook WhatsApp non valida.");
      let payload;
      try {
        payload = JSON.parse(rawBody.toString("utf8"));
      } catch {
        throw new AppError(400, "Payload webhook WhatsApp non valido.");
      }
      const event = parseWhatsAppEvent(payload);
      if (!event) return { ignored: true };
      if (!store.recordOutreachEvent("whatsapp", event.kind, `wa|${event.providerEventId}`, event))
        return { ignored: true, duplicate: true };
      if (event.kind === "inbound") return inbound(event);
      return deliveryStatus(event);
    },
    async handleResendWebhook(rawBody, headers) {
      const state = statusOf();
      if (!state.enabled)
        throw new AppError(403, "Webhook Resend non attivo su questo server.");
      if (!verifySvixSignature(rawBody, headers, outreach.resendWebhookSecret))
        throw new AppError(401, "Firma webhook Resend non valida.");
      let payload;
      try {
        payload = JSON.parse(rawBody.toString("utf8"));
      } catch {
        throw new AppError(400, "Payload webhook Resend non valido.");
      }
      const event = parseResendEvent(payload);
      if (!event) return { ignored: true };
      if (!store.recordOutreachEvent("email", event.type, `resend|${event.providerEventId}`, event))
        return { ignored: true, duplicate: true };
      if (event.kind === "inbound") {
        if (event.receivedEmailId) {
          try {
            event.body = await channels.email.fetchReceived(event.receivedEmailId);
          } catch {
            event.body = null;
            event.note = "Corpo della email non recuperato dal provider.";
          }
        }
        return inbound(event);
      }
      return deliveryStatus(event);
    },
    start() {
      if (!stopped) return;
      stopped = false;
      store.recoverOutreach();
      schedule();
    },
    shutdown() {
      stopped = true;
      clearTimeout(timer);
      timer = null;
      controller?.abort();
    },
  };

  // --- Inbound handling: record, opt-out on request, optional approved reply ---
  async function inbound(event) {
    const contact = store.findContact(event.channel, event.address);
    if (!contact) {
      store.log(
        "CONTATTI",
        `Messaggio in ingresso da un recapito ${event.channel} non presente in archivio. Registrato tra gli eventi, nessuna risposta.`,
      );
      return { ignored: true, unknownSender: true };
    }
    const partner = store.partner(contact.partnerId);
    const body = typeof event.body === "string" ? event.body : null;
    if (body && isStopRequest(body)) {
      store.updateContact(contact.id, { basis: "opt_out" });
      if (partner && partner.contactBasis !== "opt_out")
        store.updatePartner(partner.id, {
          ...partner,
          contactBasis: "opt_out",
          contactEvidence:
            partner.contactEvidence ||
            `Opposizione ricevuta su ${event.channel} il ${event.timestamp.slice(0, 10)}.`,
        });
      let cancelled = 0;
      for (const m of store
        .outreachMessages()
        .filter((x) => x.contactId === contact.id && PENDING.includes(x.status))) {
        store.updateOutreachMessage(m.id, {
          status: "cancelled",
          blockedReason: "Opposizione ricevuta dal destinatario.",
        });
        cancelled++;
      }
      store.log(
        contact.id,
        `Opposizione registrata su ${event.channel}: contatto e struttura in opt-out, ${cancelled} messaggi annullati.`,
      );
      store.addInboundMessage(contact, {
        body,
        providerEventId: event.providerEventId,
        timestamp: event.timestamp,
        type: event.type || "text",
        subject: event.subject || "",
        note: "Richiesta di non essere più contattato: opt-out applicato.",
      });
      store.addConversation(contact, { inbound: event.timestamp });
      return { optOut: true, cancelled };
    }
    const message = store.addInboundMessage(contact, {
      body,
      providerEventId: event.providerEventId,
      timestamp: event.timestamp,
      type: event.type || "text",
      subject: event.subject || "",
      note: body ? null : `Contenuto di tipo ${event.type || "non testuale"} non trascritto.`,
    });
    store.addConversation(contact, { inbound: event.timestamp });
    const campaigns = store
      .campaigns()
      .filter((c) => c.status === "active" && c.contactIds.includes(contact.id) && c.replyTemplateId);
    const campaign = campaigns[0];
    if (campaign && statusOf().enabled && reachability({ ...message, purpose: "reply", status: "queued" }) === null) {
      const template = store.template(campaign.replyTemplateId);
      if (template && template.channel === contact.channel) {
        const { duplicate } = buildMessage(
          {
            requestId: campaign.requestId,
            contactId: contact.id,
            purpose: "reply",
            templateId: template.id,
            campaignId: campaign.id,
          },
          contact,
          true,
        );
        if (!duplicate) {
          store.log(
            campaign.id,
            "Risposta automatica approvata messa in coda per il contatto che ha scritto.",
          );
          schedule();
        }
      }
    }
    return { recorded: true, messageId: message.id };
  }

  function deliveryStatus(event) {
    const message = store.messageByProviderId(event.providerMessageId);
    if (!message) {
      store.log(
        "CONTATTI",
        `Evento ${event.channel} per un messaggio non presente in archivio. Nessun invio registrato come riuscito.`,
      );
      return { ignored: true, unknownMessage: true };
    }
    const status = String(event.status || event.type || "");
    if (["delivered", "email.delivered"].includes(status)) {
      if (["sent", "delivered"].includes(message.status)) {
        store.updateOutreachMessage(message.id, {
          status: "delivered",
          deliveredAt: event.timestamp,
        });
        store.log(message.id, "Consegna confermata dal provider.");
      }
      return { status: "delivered" };
    }
    if (status === "read" || status === "email.opened") {
      if (["sent", "delivered", "read"].includes(message.status)) {
        store.updateOutreachMessage(message.id, { status: "read" });
        store.log(message.id, "Lettura o apertura segnalata dal provider.");
      }
      return { status: "read" };
    }
    if (
      [
        "failed",
        "email.failed",
        "email.bounced",
        "email.complained",
        "email.suppressed",
        "email.delivery_delayed",
      ].includes(status)
    ) {
      store.updateOutreachMessage(message.id, {
        status: "failed",
        error: `Esito negativo dal provider: ${status}${event.detail ? ` (${event.detail})` : ""}.`,
      });
      store.log(message.id, `Evento provider ${status}: messaggio non consegnato.`);
      return { status: "failed" };
    }
    return { status: "ignored", detail: status };
  }

  function countMessages() {
    const counts = {};
    for (const m of store.outreachMessages())
      counts[m.status] = (counts[m.status] || 0) + 1;
    return counts;
  }

  // Idle means: nothing in flight and nothing left that could be sent now.
  outreachApi.idle = () => {
    if (busy) return false;
    const at = now();
    return !store
      .outreachMessages()
      .some(
        (m) =>
          m.direction === "outbound" &&
          m.status === "approved" &&
          (!m.scheduledAt || Date.parse(m.scheduledAt) <= at.getTime()),
      );
  };

  return outreachApi;
}
