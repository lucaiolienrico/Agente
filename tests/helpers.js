import { setTimeout } from "node:timers/promises";
import { createStore } from "../server/store.js";
import { createAgent } from "../server/agent.js";
import { createApp } from "../server/app.js";
export const config = {
  production: false,
  preview: false,
  origin: "http://localhost:3000",
  password: "test-password-long-only",
  apiKey: "test-key-not-real",
  model: "fixture-model",
  dailyLimit: 10,
};
export const partner = {
  company: "Struttura di test",
  segment: "veterinario",
  city: "Milano",
  region: "Lombardia",
  sourceUrl: "https://example.org/struttura",
  evidence: "Fixture isolata dei test; non una struttura reale.",
  contactEmail: "",
  contactBasis: "unknown",
  contactEvidence: "",
  status: "da_verificare",
  notes: "",
};
export const text = {
  subject: "Proposta di test",
  body: "Bozza sintetica esclusivamente per il test automatico.",
};
export const response = (
  entries = [{ ...partner, country: "IT" }],
  sources = ["https://example.org/struttura"],
) => ({
  status: "completed",
  output: [
    {
      type: "web_search_call",
      status: "completed",
      action: { sources: sources.map((url) => ({ type: "url", url })) },
    },
    {
      type: "message",
      content: [
        {
          type: "output_text",
          text: JSON.stringify({
            partners: entries.map((p) =>
              Object.fromEntries(
                [
                  "company",
                  "segment",
                  "country",
                  "city",
                  "region",
                  "sourceUrl",
                  "evidence",
                ].map((k) => [k, p[k]]),
              ),
            ),
          }),
        },
      ],
    },
  ],
  usage: { input_tokens: 100, output_tokens: 200 },
});
export const research = {
  segment: "entrambi",
  region: "Tutta Italia",
  city: "",
  limit: 5,
};
export async function idle(agent) {
  for (let i = 0; i < 200; i++) {
    if (agent.idle()) return;
    await setTimeout(10);
  }
  throw new Error("Worker non terminato nel tempo del test");
}
export async function fixture(
  t,
  overrides = {},
  provider = {
    research: async () => ({
      partners: [partner],
      sources: [partner.sourceUrl],
      discarded: 0,
      usage: { input_tokens: 1, output_tokens: 2 },
    }),
    draft: async () => ({ ...text, usage: {} }),
  },
) {
  const store = createStore(":memory:");
  const cfg = { ...config, ...overrides };
  const agent = createAgent(store, provider, cfg);
  const app = createApp({
    store,
    agent,
    config: cfg,
    dist: "/missing-test-build",
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie = "";
  async function request(
    path,
    {
      method = "GET",
      body,
      auth = true,
      origin = cfg.origin,
      headers = {},
    } = {},
  ) {
    return fetch(base + "/api" + path, {
      method,
      headers: {
        ...(auth && cookie ? { Cookie: cookie } : {}),
        ...(method !== "GET"
          ? { "Content-Type": "application/json", Origin: origin }
          : {}),
        ...headers,
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  }
  async function login() {
    const r = await request("/login", {
      method: "POST",
      body: { password: cfg.password },
    });
    cookie = r.headers.get("set-cookie")?.split(";")[0] || "";
    return r;
  }
  t.after(async () => {
    agent.pause(true);
    await idle(agent);
    await new Promise((resolve) => {
      server.close(resolve);
      server.closeAllConnections();
    });
    store.close();
  });
  return { store, agent, app, request, login, base, getCookie: () => cookie };
}
