import { z } from "zod";
import { AppError } from "./domain.js";

export const OUTREACH_CHANNELS = ["email", "whatsapp"];
export const MESSAGE_STATUSES = [
  "queued",
  "approved",
  "sending",
  "sent",
  "delivered",
  "read",
  "failed",
  "unknown",
  "blocked",
  "cancelled",
];
export const channelSchema = z.enum(OUTREACH_CHANNELS);
const oneLine = (max) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((v) => !/[\r\n]/.test(v), "Il valore deve stare su una sola riga.");

export function normalizeAddress(channel, value) {
  const v = String(value || "").trim();
  if (channel === "email") {
    if (!z.string().email().max(200).safeParse(v).success || /[\r\n]/.test(v))
      throw new AppError(400, "Indirizzo email non valido.");
    return v.toLowerCase();
  }
  if (!/^\+[1-9]\d{7,14}$/.test(v))
    throw new AppError(
      400,
      "Numero WhatsApp non valido: formato internazionale E.164, ad esempio +393401234567.",
    );
  return v;
}

export const contactSchema = z
  .object({
    partnerId: z.string().uuid(),
    channel: channelSchema,
    address: oneLine(200),
    basis: z.enum(["unknown", "inbound", "consent", "opt_out"]),
    evidence: z.string().trim().max(1500),
    obtainedAt: z.string().datetime(),
    expiresAt: z.string().datetime().nullable().default(null),
  })
  .strict()
  .superRefine((c, ctx) => {
    try {
      c.address = normalizeAddress(c.channel, c.address);
    } catch (error) {
      ctx.addIssue({ code: "custom", path: ["address"], message: error.message });
    }
    if (["inbound", "consent"].includes(c.basis) && c.evidence.length < 10)
      ctx.addIssue({
        code: "custom",
        path: ["evidence"],
        message:
          "Documenta origine, data, ambito e canale della richiesta o del consenso (almeno 10 caratteri).",
      });
    if (Date.parse(c.obtainedAt) > Date.now() + 60000)
      ctx.addIssue({
        code: "custom",
        path: ["obtainedAt"],
        message: "La data della base di contatto non può essere futura.",
      });
    if (c.expiresAt && Date.parse(c.expiresAt) <= Date.parse(c.obtainedAt))
      ctx.addIssue({
        code: "custom",
        path: ["expiresAt"],
        message: "La scadenza deve essere successiva alla data di raccolta.",
      });
  });

export const templateSchema = z
  .object({
    name: oneLine(100),
    channel: channelSchema,
    subject: z.string().trim().max(140).default(""),
    body: z.string().trim().min(10).max(4000),
    waName: z
      .string()
      .trim()
      .regex(/^[a-z0-9_]*$/)
      .max(100)
      .default(""),
    language: z
      .string()
      .trim()
      .regex(/^[a-z]{2}(?:_[A-Z]{2})?$/)
      .default("it"),
  })
  .strict()
  .superRefine((t, ctx) => {
    if (t.channel === "email" && !t.subject)
      ctx.addIssue({
        code: "custom",
        path: ["subject"],
        message: "Oggetto obbligatorio per un modello email.",
      });
    if (t.channel === "whatsapp") {
      if (!t.waName)
        ctx.addIssue({
          code: "custom",
          path: ["waName"],
          message:
            "Indica il nome del modello approvato in Meta Business Manager.",
        });
      if (/{{|}}/.test(t.body))
        ctx.addIssue({
          code: "custom",
          path: ["body"],
          message:
            "Solo modelli WhatsApp statici: nessun parametro {{…}}. Il testo deve coincidere con il modello approvato.",
        });
    }
  });

export const messageSchema = z
  .object({
    requestId: z.string().uuid(),
    contactId: z.string().uuid(),
    purpose: z.enum(["initial", "reply", "followup"]),
    templateId: z.string().uuid().nullable().default(null),
    subject: z.string().trim().max(140).default(""),
    body: z.string().trim().max(4000).default(""),
    scheduledAt: z.string().datetime().nullable().default(null),
    // false (default) leaves the message queued for a separate approval step.
    confirmed: z.boolean().default(false),
  })
  .strict()
  .superRefine((m, ctx) => {
    if (m.purpose === "reply" && !m.body)
      ctx.addIssue({
        code: "custom",
        path: ["body"],
        message: "Una risposta richiede il testo revisionato.",
      });
  });

export const campaignSchema = z
  .object({
    requestId: z.string().uuid(),
    name: oneLine(120),
    contactIds: z.array(z.string().uuid()).min(1).max(50),
    initialTemplateId: z.string().uuid(),
    followupTemplateId: z.string().uuid().nullable().default(null),
    replyTemplateId: z.string().uuid().nullable().default(null),
    followupDays: z.number().int().min(3).max(14).default(3),
    confirmed: z.literal(true),
  })
  .strict();

export function outreachKey(message) {
  const body = message.templateId || `${message.subject}\n${message.body}`;
  return [message.contactId, message.purpose, body].join("|");
}

export function isStopRequest(text) {
  return /(^|[\s.,;:!?"'])(stop|basta|unsubscribe|disiscrivimi|disiscrivi|cancellami|rimuovimi|non\s+contattarmi|non\s+mi\s+interessa|non\s+voglio\s+(più\s+)?(messaggi|essere\s+contattato))([\s.,;:!?"']|$)/i.test(
    String(text || ""),
  );
}

const romeParts = (date, options) =>
  Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Rome", ...options })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );

export function isBusinessHours(date = new Date()) {
  const p = romeParts(date, { weekday: "short", hour: "2-digit", hourCycle: "h23" });
  return !["Sat", "Sun"].includes(p.weekday) && Number(p.hour) >= 9 && Number(p.hour) < 18;
}

export function addBusinessDays(from, days) {
  const date = new Date(from);
  let remaining = days;
  while (remaining > 0) {
    date.setUTCDate(date.getUTCDate() + 1);
    if (!["Sat", "Sun"].includes(romeParts(date, { weekday: "short" }).weekday))
      remaining--;
  }
  return date.toISOString();
}

export function outreachConfig(env = process.env) {
  const bool = (value, name) => {
    if (value === undefined || value === "") return false;
    if (!["true", "false"].includes(value))
      throw new Error(`${name} deve essere true oppure false.`);
    return value === "true";
  };
  const dailyLimit = Number(env.OUTREACH_DAILY_LIMIT || 20);
  if (!Number.isInteger(dailyLimit) || dailyLimit < 1 || dailyLimit > 100)
    throw new Error("OUTREACH_DAILY_LIMIT deve essere un intero tra 1 e 100.");
  const version = (env.WA_GRAPH_VERSION || "").trim();
  if (version && !/^v\d{2}\.\d$/.test(version))
    throw new Error("WA_GRAPH_VERSION deve avere il formato vNN.N, ad esempio v23.0.");
  for (const key of ["WA_PHONE_NUMBER_ID", "WA_BUSINESS_ACCOUNT_ID"])
    if (env[key] && !/^\d{1,25}$/.test(env[key].trim()))
      throw new Error(`${key} deve contenere solo cifre.`);
  const enabled = bool(env.OUTREACH_ENABLED, "OUTREACH_ENABLED");
  const businessHours =
    env.OUTREACH_BUSINESS_HOURS === undefined || env.OUTREACH_BUSINESS_HOURS === ""
      ? true
      : bool(env.OUTREACH_BUSINESS_HOURS, "OUTREACH_BUSINESS_HOURS");
  const config = {
    enabled,
    businessHours,
    dailyLimit,
    resendKey: (env.RESEND_API_KEY || "").trim(),
    emailFrom: (env.RESEND_FROM || "").trim(),
    emailReplyTo: (env.RESEND_REPLY_TO || "").trim(),
    resendWebhookSecret: (env.RESEND_WEBHOOK_SECRET || "").trim(),
    waToken: (env.WA_ACCESS_TOKEN || "").trim(),
    waPhoneId: (env.WA_PHONE_NUMBER_ID || "").trim(),
    waBusinessId: (env.WA_BUSINESS_ACCOUNT_ID || "").trim(),
    waVersion: version,
    waAppSecret: (env.WA_APP_SECRET || "").trim(),
    waVerifyToken: (env.WA_VERIFY_TOKEN || "").trim(),
  };
  if (enabled) {
    if (env.NODE_ENV === "test")
      throw new Error(
        "OUTREACH_ENABLED=true non è ammesso con NODE_ENV=test: gli invii reali richiedono un ambiente esplicito.",
      );
    if (config.resendWebhookSecret.length < 16)
      throw new Error(
        "RESEND_WEBHOOK_SECRET deve contenere almeno 16 caratteri. Non inserirlo in chat o in Git.",
      );
    if (config.waVerifyToken && config.waVerifyToken.length < 16)
      throw new Error("WA_VERIFY_TOKEN deve contenere almeno 16 caratteri.");
  }
  return config;
}

function addressIssue(value, label) {
  try {
    normalizeAddress("email", value);
    return null;
  } catch {
    return `${label} non è un indirizzo email valido.`;
  }
}

export function channelReadiness(config, channel) {
  if (channel === "email") {
    const missing = [];
    if (!config.resendKey) missing.push("RESEND_API_KEY");
    if (!config.emailFrom) missing.push("RESEND_FROM");
    if (!config.emailReplyTo) missing.push("RESEND_REPLY_TO");
    if (!config.resendWebhookSecret) missing.push("RESEND_WEBHOOK_SECRET");
    const invalid = [
      config.emailFrom ? addressIssue(config.emailFrom, "RESEND_FROM") : null,
      config.emailReplyTo ? addressIssue(config.emailReplyTo, "RESEND_REPLY_TO") : null,
    ].filter(Boolean);
    const ready = !missing.length && !invalid.length;
    return {
      channel,
      label: "Email (Resend)",
      ready,
      issue: invalid[0] || (ready ? null : `Configura sul server: ${missing.join(", ")}.`),
      hint: ready
        ? "Configurazione presente. Non è ancora una prova di invio riuscita."
        : "Webhook richiesto per consegnare le risposte al workspace: imposta anche RESEND_WEBHOOK_SECRET.",
    };
  }
  const missing = [];
  if (!config.waToken) missing.push("WA_ACCESS_TOKEN");
  if (!config.waPhoneId) missing.push("WA_PHONE_NUMBER_ID");
  if (!config.waBusinessId) missing.push("WA_BUSINESS_ACCOUNT_ID");
  if (!config.waVersion) missing.push("WA_GRAPH_VERSION");
  if (!config.waAppSecret) missing.push("WA_APP_SECRET");
  if (!config.waVerifyToken) missing.push("WA_VERIFY_TOKEN");
  const ready = !missing.length;
  return {
    channel,
    label: "WhatsApp Business (API Cloud Meta)",
    ready,
    issue: ready ? null : `Configura sul server: ${missing.join(", ")}.`,
    hint: ready
      ? "Configurazione presente. I primi messaggi fuori dalla finestra di 24 ore richiedono un modello approvato da Meta."
      : "Le API ufficiali richiedono un numero WhatsApp Business dedicato e modelli approvati. Nessuna automazione di WhatsApp Web.",
  };
}

export function outreachStatus(config) {
  const preview = config.preview === true;
  const enabled = config.outreach?.enabled === true && !preview;
  const channels = OUTREACH_CHANNELS.map((channel) =>
    channelReadiness(config.outreach || {}, channel),
  );
  return {
    enabled,
    preview,
    testMode: config.outreach?.test === true,
    dailyLimit: config.outreach?.dailyLimit ?? 0,
    businessHours: config.outreach?.businessHours ?? true,
    channels,
    readyChannels: channels.filter((c) => c.ready).map((c) => c.channel),
    configHint: preview
      ? "Anteprima aperta: ogni invio esterno è bloccato in modo permanente."
      : enabled
        ? "Invii abilitati. Restano obbligatori autorizzazione documentata, approvazione del messaggio, limiti giornalieri e orario lavorativo."
        : "Invii disattivati. Per attivare un canale imposta OUTREACH_ENABLED=true e le variabili del provider soltanto nell’ambiente del server.",
  };
}
