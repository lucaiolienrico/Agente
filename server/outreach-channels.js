import { createHmac, timingSafeEqual } from "node:crypto";

// Every adapter talks to a provider API and never simulates a delivery.
// Errors are sanitized: provider payloads may echo addresses or tokens.
export class OutreachError extends Error {
  constructor(status, message, { retryable = false, code = null } = {}) {
    super(message);
    this.name = "OutreachError";
    this.status = status;
    this.retryable = retryable;
    this.code = code;
  }
}

export function sanitizeDetail(error) {
  const text = String(error?.message || error || "").replace(/\s+/g, " ").trim();
  return text.slice(0, 240) || "Errore non specificato dal provider.";
}

async function requestJSON(url, { method = "POST", headers = {}, body, signal }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error("timeout")), 30000);
  const onAbort = () => controller.abort(new Error("annullato"));
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    const response = await fetch(url, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: controller.signal,
    });
    const text = await response.text();
    let payload = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = null;
    }
    return { ok: response.ok, status: response.status, payload, text };
  } catch (error) {
    if (signal?.aborted)
      throw new OutreachError(0, "Invio annullato dall’operatore.", { retryable: false });
    throw new OutreachError(0, `Provider non raggiungibile: ${sanitizeDetail(error)}`, {
      retryable: true,
    });
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", onAbort);
  }
}

export function disabledChannels(reason) {
  const blocked = () => {
    throw new OutreachError(503, reason);
  };
  return {
    email: { name: "email", ready: false, send: blocked, fetchReceived: blocked },
    whatsapp: { name: "whatsapp", ready: false, send: blocked },
  };
}

export function createResendChannel(config) {
  const missing = [];
  if (!config.resendKey) missing.push("RESEND_API_KEY");
  if (!config.emailFrom) missing.push("RESEND_FROM");
  if (!config.emailReplyTo) missing.push("RESEND_REPLY_TO");
  if (missing.length)
    return {
      name: "email",
      ready: false,
      send: () => {
        throw new OutreachError(503, `Email non configurata: ${missing.join(", ")}.`);
      },
      fetchReceived: () => null,
    };
  const endpoint = (config.resendEndpoint || "https://api.resend.com").replace(/\/$/, "");
  return {
    name: "email",
    ready: true,
    async send({ to, subject, body, idempotencyKey }, signal) {
      const result = await requestJSON(`${endpoint}/emails`, {
        headers: {
          Authorization: `Bearer ${config.resendKey}`,
          "Content-Type": "application/json",
          ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
        },
        body: {
          from: config.emailFrom,
          to: [to],
          reply_to: config.emailReplyTo,
          subject,
          text: body,
        },
        signal,
      });
      const id = result.payload?.id;
      if (!result.ok || typeof id !== "string" || !id)
        throw new OutreachError(
          result.status || 502,
          `Resend non ha accettato l’email: ${sanitizeDetail(
            result.payload?.message || result.payload?.error || result.text || result.status,
          )}`,
          { retryable: !result.status || result.status >= 500 || result.status === 429 },
        );
      return { providerMessageId: id, status: "sent", provider: "resend" };
    },
    async fetchReceived(emailId, signal) {
      const result = await requestJSON(`${endpoint}/emails/received/${emailId}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${config.resendKey}` },
        signal,
      });
      if (!result.ok) return null;
      const payload = result.payload || {};
      const headers = payload.headers || {};
      const text = [headers["text/plain"], payload.text, payload.body]
        .filter((v) => typeof v === "string" && v.trim())
        .join("\n")
        .trim();
      return text ? text.slice(0, 4000) : null;
    },
  };
}

export function createWhatsAppChannel(config) {
  const missing = [];
  if (!config.waToken) missing.push("WA_ACCESS_TOKEN");
  if (!config.waPhoneId) missing.push("WA_PHONE_NUMBER_ID");
  if (!config.waVersion) missing.push("WA_GRAPH_VERSION");
  if (missing.length)
    return {
      name: "whatsapp",
      ready: false,
      send: () => {
        throw new OutreachError(503, `WhatsApp non configurato: ${missing.join(", ")}.`);
      },
    };
  const endpoint =
    (config.waEndpoint || "https://graph.facebook.com").replace(/\/$/, "") +
    `/${config.waVersion}/${config.waPhoneId}/messages`;
  return {
    name: "whatsapp",
    ready: true,
    async send({ to, body, template }, signal) {
      const payload = template
        ? {
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: to.replace(/^\+/, ""),
            type: "template",
            template: {
              name: template.name,
              language: { code: template.language || "it" },
            },
          }
        : {
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: to.replace(/^\+/, ""),
            type: "text",
            text: { preview_url: false, body },
          };
      const result = await requestJSON(endpoint, {
        headers: {
          Authorization: `Bearer ${config.waToken}`,
          "Content-Type": "application/json",
        },
        body: payload,
        signal,
      });
      const id = result.payload?.messages?.[0]?.id;
      if (!result.ok || typeof id !== "string" || !id) {
        const error = result.payload?.error;
        throw new OutreachError(
          result.status || 502,
          `WhatsApp non ha accettato il messaggio: ${sanitizeDetail(
            error?.message || result.text || result.status,
          )}`,
          {
            retryable: !result.status || result.status >= 500 || result.status === 429,
            code: error?.code ?? null,
          },
        );
      }
      return { providerMessageId: id, status: "sent", provider: "whatsapp-cloud" };
    },
  };
}

export function createOutreachChannels(config, outreach) {
  if (!outreach?.enabled || config.preview)
    return disabledChannels(
      config.preview
        ? "Anteprima aperta: nessun messaggio può essere inviato all’esterno."
        : "Invii esterni disattivati (OUTREACH_ENABLED=false). Nessun messaggio è stato consegnato a un provider.",
    );
  return {
    email: createResendChannel(outreach),
    whatsapp: createWhatsAppChannel(outreach),
  };
}

// --- Webhook payload parsing: tolerant, defensive, never trusts prose. ---

export function parseWhatsAppEvent(payload) {
  const value = payload?.entry?.[0]?.changes?.[0]?.value;
  if (!value || value.messaging_product !== "whatsapp") return null;
  const message = Array.isArray(value.messages) ? value.messages.at(-1) : null;
  if (message) {
    const from = String(message.from || "").replace(/\D/g, "");
    if (!from || typeof message.id !== "string" || !message.id) return null;
    return {
      channel: "whatsapp",
      kind: "inbound",
      providerEventId: message.id,
      providerMessageId: null,
      address: `+${from}`,
      type: message.type || "unknown",
      body:
        typeof message.text?.body === "string" ? message.text.body.slice(0, 4000) : null,
      timestamp: message.timestamp
        ? new Date(Number(message.timestamp) * 1000).toISOString()
        : new Date().toISOString(),
    };
  }
  const status = Array.isArray(value.statuses) ? value.statuses.at(-1) : null;
  if (status && typeof status.id === "string" && status.id)
    return {
      channel: "whatsapp",
      kind: "status",
      providerEventId: `${status.id}:${status.status || "unknown"}`,
      providerMessageId: status.id,
      status: String(status.status || ""),
      detail: status.errors?.[0]?.title || status.errors?.[0]?.message || null,
      timestamp: status.timestamp
        ? new Date(Number(status.timestamp) * 1000).toISOString()
        : new Date().toISOString(),
    };
  return null;
}

export function parseResendEvent(payload) {
  const type = String(payload?.type || "");
  const data = payload?.data;
  if (!type.startsWith("email.") || !data) return null;
  const base = {
    channel: "email",
    type,
    timestamp:
      typeof payload.created_at === "string" ? payload.created_at : new Date().toISOString(),
  };
  if (type === "email.received") {
    const from = String(data.from || "").trim().toLowerCase();
    if (!from) return null;
    return {
      ...base,
      kind: "inbound",
      providerEventId: String(data.email_id || data.message_id || ""),
      providerMessageId: null,
      receivedEmailId: typeof data.email_id === "string" ? data.email_id : null,
      address: from,
      subject: typeof data.subject === "string" ? data.subject.slice(0, 200) : "",
      body: null,
    };
  }
  const id = typeof data.email_id === "string" ? data.email_id : null;
  if (!id) return null;
  return { ...base, kind: "status", providerEventId: `${type}:${id}`, providerMessageId: id };
}

export function verifyMetaSignature(rawBody, header, appSecret) {
  if (!rawBody?.length || !header || !appSecret) return false;
  const supplied = String(header).trim();
  const matches = /^(?:sha256=)?([a-f0-9]{64})$/i.exec(supplied);
  if (!matches) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody).digest();
  const actual = Buffer.from(matches[1], "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function verifySvixSignature(rawBody, headers, secret) {
  if (!rawBody?.length || !secret) return false;
  const id = headers["svix-id"] || headers["webhook-id"];
  const timestamp = headers["svix-timestamp"] || headers["webhook-timestamp"];
  const signature = headers["svix-signature"] || headers["webhook-signature"];
  if (!id || !timestamp || !signature) return false;
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > 300) return false;
  const key = secret.startsWith("whsec_")
    ? Buffer.from(secret.slice(6), "base64")
    : Buffer.from(secret, "utf8");
  if (!key.length) return false;
  const expected = createHmac("sha256", key)
    .update(`${id}.${timestamp}.${rawBody.toString("utf8")}`)
    .digest("base64");
  return String(signature)
    .split(" ")
    .map((part) => part.split(",").at(-1))
    .some((candidate) => {
      const a = Buffer.from(String(candidate), "base64");
      const b = Buffer.from(expected, "base64");
      return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
    });
}
