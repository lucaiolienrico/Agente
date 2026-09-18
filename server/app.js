import { aiStatus, GROQ_DEFAULT_MODEL } from "./ai-config.js";
import express from "express";
import helmet from "helmet";
import { randomBytes, timingSafeEqual, createHash } from "node:crypto";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import {
  AppError,
  parse,
  partnerSchema,
  researchSchema,
  knowledgeSchema,
  draftEditSchema,
  canApprove,
  regions,
} from "./domain.js";
import {
  contactSchema,
  templateSchema,
  messageSchema,
  campaignSchema,
  outreachConfig,
  outreachStatus,
} from "./outreach-domain.js";
import { createOutreachChannels } from "./outreach-channels.js";
import { createOutreach } from "./outreach.js";

export function configFromEnv(env = process.env) {
  const production = env.NODE_ENV === "production";
  const preview = env.DEV_AUTH_BYPASS === "true";
  const origin = (env.APP_ORIGIN || "http://localhost:3000").replace(/\/$/, "");
  let url;
  try {
    url = new URL(origin);
  } catch {
    throw new Error("APP_ORIGIN deve essere un URL valido.");
  }
  if (url.origin !== origin || url.username || url.password)
    throw new Error("APP_ORIGIN deve contenere solo schema e host.");
  if (
    production &&
    (preview ||
      url.protocol !== "https:" ||
      !env.ADMIN_PASSWORD ||
      env.ADMIN_PASSWORD.length < 12)
  )
    throw new Error(
      "Produzione: HTTPS, ADMIN_PASSWORD di almeno 12 caratteri e DEV_AUTH_BYPASS=false obbligatori.",
    );
  if (env.ADMIN_PASSWORD && env.ADMIN_PASSWORD.length < 12)
    throw new Error("ADMIN_PASSWORD deve contenere almeno 12 caratteri.");
  const outreach = outreachConfig(env);
  if (outreach.enabled && preview)
    throw new Error(
      "OUTREACH_ENABLED=true non è ammesso con DEV_AUTH_BYPASS=true: gli invii richiedono un accesso protetto.",
    );
  const dailyLimit = Number(env.DAILY_AI_LIMIT || 10);
  if (!Number.isInteger(dailyLimit) || dailyLimit < 1 || dailyLimit > 100)
    throw new Error("DAILY_AI_LIMIT deve essere tra 1 e 100.");
  const provider = (env.AI_PROVIDER || "groq").trim().toLowerCase();
  if (!["groq", "openai"].includes(provider))
    throw new Error("AI_PROVIDER deve essere groq oppure openai.");
  if (
    env.GROQ_SEARCH_ENABLED &&
    !["true", "false"].includes(env.GROQ_SEARCH_ENABLED)
  )
    throw new Error("GROQ_SEARCH_ENABLED deve essere true oppure false.");
  return {
    provider,
    searchEnabled: provider === "openai" || env.GROQ_SEARCH_ENABLED === "true",
    production,
    preview,
    outreach,
    origin,
    password: env.ADMIN_PASSWORD || "",
    apiKey:
      provider === "groq" ? env.GROQ_API_KEY || "" : env.OPENAI_API_KEY || "",
    model:
      provider === "groq"
        ? env.GROQ_MODEL || GROQ_DEFAULT_MODEL
        : env.OPENAI_MODEL || "",
    dailyLimit,
  };
}
function hash(text) {
  return createHash("sha256").update(text).digest();
}
function asyncWrap(handler) {
  return async (req, res, next) => {
    try {
      const body = Buffer.isBuffer(req.body) ? req.body : null;
      const headers = Object.fromEntries(
        Object.entries(req.headers).map(([k, v]) => [k.toLowerCase(), v]),
      );
      if (req.method === "GET") {
        const challenge = await handler(req.query);
        res.type("text/plain").send(challenge);
        return;
      }
      if (!body) throw new AppError(415, "Corpo del webhook mancante.");
      const result = await handler(body, headers);
      res.json(result && typeof result === "object" ? result : { ok: true });
    } catch (error) {
      next(error);
    }
  };
}
function sessionToken(req) {
  return (
    (req.headers.cookie || "")
      .split(";")
      .map((v) => v.trim())
      .find((v) => v.startsWith("petnote_session="))
      ?.slice(16) || ""
  );
}
export function csvCell(value) {
  let text = String(value ?? "");
  if (/^[\s]*[=+@\-]|^[\t\r\n]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
export function createApp({
  store,
  agent,
  config,
  outreach,
  dist = resolve("dist"),
}) {
  const app = express();
  const outreachConfigValue = config.outreach || outreachConfig({});
  const outreachEngine =
    outreach ||
    createOutreach({
      store,
      config,
      outreach: outreachConfigValue,
      channels: createOutreachChannels(config, outreachConfigValue),
    });
  app.disable("x-powered-by");
  // Do not trust client-supplied forwarded headers. Single admin; login budget is global.
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'"],
          imgSrc: ["'self'", "data:"],
          connectSrc: ["'self'"],
          upgradeInsecureRequests: config.production ? [] : null,
          frameAncestors: config.production ? ["'none'"] : null,
        },
      },
      frameguard: config.production ? { action: "deny" } : false,
      strictTransportSecurity: config.production ? undefined : false,
    }),
  );
  app.use("/api", (req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  // Provider callbacks are verified by signature, not by session, and need the
  // untouched body: mount the raw readers before the global JSON parser.
  app.get("/api/webhooks/whatsapp", asyncWrap(outreachEngine.handleWhatsAppVerification));
  app.post(
    "/api/webhooks/whatsapp",
    express.raw({ type: "*/*", limit: "64kb" }),
    asyncWrap(outreachEngine.handleWhatsAppWebhook),
  );
  app.post(
    "/api/webhooks/resend",
    express.raw({ type: "*/*", limit: "64kb" }),
    asyncWrap(outreachEngine.handleResendWebhook),
  );
  app.use(express.json({ limit: "32kb", strict: true }));
  app.use("/api", (req, res, next) => {
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      const origin = req.get("origin");
      let same = false;
      try {
        same =
          origin === config.origin ||
          (config.preview && new URL(origin).host === req.get("host"));
      } catch {}
      if (!same)
        throw new AppError(
          403,
          "Origine non autorizzata. Controlla APP_ORIGIN sul server.",
        );
      if (!req.is("application/json"))
        throw new AppError(415, "È richiesto application/json.");
    }
    next();
  });
  const authenticated = (req) =>
    config.preview || store.session(sessionToken(req));
  app.get("/api/health", (_req, res) =>
    res.json({ ok: true, service: "petnote-partnership-agent" }),
  );
  app.get("/api/session", (req, res) =>
    res.json({
      authenticated: authenticated(req),
      preview: config.preview,
      configured: !!config.password,
    }),
  );
  let loginFailures = [];
  app.post("/api/login", (req, res) => {
    if (!config.password)
      throw new AppError(
        503,
        "Imposta ADMIN_PASSWORD sul server. Non inserire segreti in chat.",
      );
    const time = Date.now();
    loginFailures = loginFailures.filter((t) => t > time - 15 * 60 * 1000);
    if (loginFailures.length >= 10) {
      res.set("Retry-After", "900");
      throw new AppError(429, "Troppi tentativi. Riprova tra 15 minuti.");
    }
    const supplied =
      typeof req.body?.password === "string" ? req.body.password : "";
    if (!timingSafeEqual(hash(supplied), hash(config.password))) {
      loginFailures.push(time);
      throw new AppError(401, "Password non corretta.");
    }
    loginFailures = [];
    const old = sessionToken(req);
    if (old) store.deleteSession(old);
    const token = randomBytes(32).toString("hex");
    store.createSession(token);
    res.cookie("petnote_session", token, {
      httpOnly: true,
      secure: config.production,
      sameSite: "strict",
      maxAge: 8 * 60 * 60 * 1000,
      path: "/",
    });
    store.log("ACCESSO", "Accesso amministratore.");
    res.json({ ok: true });
  });
  app.use("/api", (req, _res, next) => {
    if (!authenticated(req))
      throw new AppError(401, "Accedi come amministratore.");
    next();
  });
  app.post("/api/logout", (req, res) => {
    store.deleteSession(sessionToken(req));
    res.clearCookie("petnote_session", {
      httpOnly: true,
      secure: config.production,
      sameSite: "strict",
      path: "/",
    });
    res.json({ ok: true });
  });
  app.get("/api/state", (_req, res) =>
    res.json({
      partners: store.partners(),
      drafts: store.drafts(),
      jobs: store.jobs().slice(0, 100),
      audit: store.audit(),
      knowledge: store.knowledge(),
      regions,
      agent: {
        paused: store.isPaused(),
        preview: config.preview,
        ...aiStatus(config),
        dailyLimit: config.dailyLimit,
        usedToday: store.callCount(),
        usage: store.usage(),
      },
      outreach: outreachEngine.status(),
      contacts: store.contacts(),
      templates: store.templates(),
      messages: store.outreachMessages().slice(0, 200),
      conversations: store.conversations(),
      campaigns: store.campaigns(),
      outreachEvents: store.outreachEvents(100),
    }),
  );
  app.post("/api/partners", (req, res) => {
    const p = store.addPartner(parse(partnerSchema, req.body), {
      origin: "manual",
    });
    if (!p) throw new AppError(409, "Struttura già presente (nome e città).");
    res.status(201).json(p);
  });
  app.put("/api/partners/:id", (req, res) =>
    res.json(
      store.updatePartner(req.params.id, parse(partnerSchema, req.body)),
    ),
  );
  app.put("/api/knowledge", (req, res) =>
    res.json(store.setKnowledge(parse(knowledgeSchema, req.body))),
  );
  app.post("/api/research", (req, res) =>
    res
      .status(202)
      .json(agent.enqueueResearch(parse(researchSchema, req.body))),
  );
  app.post("/api/partners/:id/drafts", (req, res) =>
    res.status(202).json(agent.enqueueDraft(req.params.id)),
  );
  app.post("/api/jobs/:id/cancel", (req, res) => {
    agent.cancel(req.params.id);
    res.json({ ok: true });
  });
  app.post("/api/agent/pause", (req, res) => {
    if (typeof req.body?.paused !== "boolean")
      throw new AppError(400, "Specifica paused: true o false.");
    agent.pause(req.body.paused);
    res.json({ ok: true });
  });
  app.put("/api/drafts/:id", (req, res) => {
    const d = store.updateDraft(req.params.id, {
      ...parse(draftEditSchema, req.body),
      status: "review",
      approvedAt: null,
    });
    store.log(
      d.id,
      "Bozza modificata: approvazione revocata, revisione richiesta.",
    );
    res.json(d);
  });
  function approval(id) {
    const d = store.draft(id);
    if (!d) throw new AppError(404, "Bozza non trovata.");
    if (d.knowledgeVersion !== store.knowledge().version)
      throw new AppError(
        409,
        "Questa bozza usa una scheda prodotto superata: genera una nuova bozza.",
      );
    const reason = canApprove(store.partner(d.partnerId), store.knowledge());
    if (reason) throw new AppError(409, reason);
    return d;
  }
  app.post("/api/drafts/:id/approve", (req, res) => {
    if (req.body?.confirmed !== true)
      throw new AppError(
        400,
        "Conferma la revisione del testo e la pertinenza del consenso o della richiesta.",
      );
    const d = approval(req.params.id);
    res.json(
      store.updateDraft(d.id, {
        status: "approved",
        approvedAt: new Date().toISOString(),
      }),
    );
    store.log(
      d.id,
      "Bozza approvata dall’amministratore. Nessun invio eseguito.",
    );
  });
  app.get("/api/drafts/:id/export", (req, res) => {
    const d = approval(req.params.id);
    if (d.status !== "approved")
      throw new AppError(409, "Approva la bozza prima dell’esportazione.");
    const p = store.partner(d.partnerId);
    store.log(d.id, "Testo approvato esportato. Nessun invio eseguito.");
    res
      .set(
        "Content-Disposition",
        `attachment; filename="petnote-bozza-${d.id}.txt"`,
      )
      .type("text/plain")
      .send(
        `BOZZA APPROVATA — NON INVIATA\nStruttura: ${p.company}\nRecapito autorizzato: ${p.contactEmail}\n\nOggetto: ${d.subject}\n\n${d.body}\n`,
      );
  });
  app.get("/api/export/partners.csv", (_req, res) => {
    const columns = [
      "company",
      "segment",
      "city",
      "region",
      "status",
      "sourceUrl",
      "evidence",
      "contactEmail",
      "contactBasis",
      "contactEvidence",
      "notes",
      "origin",
      "createdAt",
    ];
    const rows = [
      columns,
      ...store.partners().map((p) => columns.map((c) => p[c])),
    ];
    store.log("EXPORT", "Archivio strutture esportato in CSV. Nessun invio.");
    res
      .set(
        "Content-Disposition",
        'attachment; filename="petnote-strutture.csv"',
      )
      .type("text/csv")
      .send(
        "\uFEFF" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n"),
      );
  });
  // --- Contatti multicanale: autorizzazioni, modelli, messaggi approvati ---
  app.get("/api/outreach/status", (_req, res) => res.json(outreachEngine.status()));
  app.post("/api/outreach/pause", (req, res) => {
    if (typeof req.body?.paused !== "boolean")
      throw new AppError(400, "Specifica paused: true oppure false.");
    res.json(outreachEngine.pause(req.body.paused));
  });
  app.get("/api/outreach/contacts", (_req, res) => res.json(store.contacts()));
  app.post("/api/outreach/contacts", (req, res) =>
    res.status(201).json(outreachEngine.addContact(parse(contactSchema, req.body))),
  );
  app.put("/api/outreach/contacts/:id", (req, res) =>
    res.json(outreachEngine.updateContact(req.params.id, parse(contactSchema, req.body))),
  );
  app.get("/api/outreach/contacts/:id/reachability", (req, res) =>
    res.json(outreachEngine.reachable(req.params.id, req.query.messageId || null)),
  );
  app.get("/api/outreach/templates", (_req, res) => res.json(store.templates()));
  app.post("/api/outreach/templates", (req, res) =>
    res.status(201).json(outreachEngine.addTemplate(parse(templateSchema, req.body))),
  );
  app.put("/api/outreach/templates/:id", (req, res) =>
    res.json(outreachEngine.updateTemplate(req.params.id, parse(templateSchema, req.body))),
  );
  app.get("/api/outreach/messages", (_req, res) =>
    res.json(store.outreachMessages().slice(0, 300)),
  );
  app.post("/api/outreach/messages", (req, res) => {
    const input = parse(messageSchema, req.body);
    const created = outreachEngine.createMessage(input, { autoApprove: input.confirmed === true });
    res.status(created.duplicate ? 200 : 201).json(created);
  });
  app.post("/api/outreach/messages/:id/approve", (req, res) => {
    if (req.body?.confirmed !== true)
      throw new AppError(
        400,
        "Conferma di avere riletto il testo e verificato autorizzazione e recapito.",
      );
    res.json(outreachEngine.approve(req.params.id));
  });
  app.post("/api/outreach/messages/:id/cancel", (req, res) =>
    res.json(outreachEngine.cancel(req.params.id)),
  );
  app.get("/api/outreach/campaigns", (_req, res) => res.json(store.campaigns()));
  app.post("/api/outreach/campaigns", (req, res) =>
    res.status(201).json(outreachEngine.createCampaign(parse(campaignSchema, req.body))),
  );
  app.get("/api/outreach/conversations", (_req, res) =>
    res.json({
      conversations: store.conversations(),
      messages: store.outreachMessages().slice(0, 300),
      events: store.outreachEvents(100),
    }),
  );
  app.use("/api", (_req, _res, next) =>
    next(new AppError(404, "Endpoint non disponibile.")),
  );
  if (existsSync(resolve(dist, "index.html"))) {
    app.use(express.static(dist, { index: "index.html" }));
    app.get("/{*path}", (_req, res) =>
      res.sendFile(resolve(dist, "index.html")),
    );
  } else
    app.get("/", (_req, res) =>
      res
        .status(503)
        .type("text/plain")
        .send(
          "Frontend non compilato. Esegui npm run build, oppure avvia Vite con npm run dev.",
        ),
    );
  app.use((error, _req, res, _next) => {
    const status =
      error instanceof AppError
        ? error.status
        : error.type === "entity.too.large"
          ? 413
          : error.type === "entity.parse.failed"
            ? 400
            : 500;
    res.status(status).json({
      error:
        error instanceof AppError
          ? error.message
          : status === 413
            ? "Richiesta troppo grande."
            : status === 400
              ? "JSON non valido."
              : "Errore interno. Nessuna operazione esterna dichiarata come riuscita.",
    });
  });
  app.locals.outreach = outreachEngine;
  return app;
}
