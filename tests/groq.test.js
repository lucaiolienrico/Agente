import test from "node:test";
import assert from "node:assert/strict";
import { configFromEnv } from "../server/app.js";
import { aiStatus, GROQ_SEARCH_MODEL } from "../server/ai-config.js";
import { createProvider } from "../server/provider.js";
import { parseGroqOutput, groqSearchSources } from "../server/groq-provider.js";
import { config, partner, text, research, fixture, idle } from "./helpers.js";

const groq = {
  ...config,
  provider: "groq",
  model: "openai/gpt-oss-20b",
  searchEnabled: false,
};
const reply = (value, tools) => ({
  choices: [
    {
      finish_reason: "stop",
      message: {
        content: JSON.stringify(value),
        ...(tools ? { executed_tools: tools } : {}),
      },
    },
  ],
  usage: { prompt_tokens: 12, completion_tokens: 34 },
});
const entry = Object.fromEntries(
  ["company", "segment", "city", "region", "sourceUrl", "evidence"].map((k) => [
    k,
    partner[k],
  ]),
);
const searchReply = (entries = [{ ...entry, country: "IT" }]) =>
  reply({ partners: entries }, [
    {
      type: "search",
      search_results: {
        results: [{ url: partner.sourceUrl, content: "Fixture pubblica" }],
      },
    },
  ]);
const mock =
  (result, capture = () => {}) =>
  async (url, init) => {
    capture(url, init);
    return { ok: true, json: async () => result };
  };

test("Groq è predefinito e ignora le chiavi OpenAI, selezione errata non fa fallback", () => {
  const c = configFromEnv({
    GROQ_API_KEY: "fixture-groq",
    OPENAI_API_KEY: "fixture-openai",
    OPENAI_MODEL: "other-model",
  });
  assert.equal(c.provider, "groq");
  assert.equal(c.apiKey, "fixture-groq");
  assert.equal(c.model, "openai/gpt-oss-20b");
  assert.equal(aiStatus(c).draftEnabled, true);
  assert.equal(aiStatus(c).researchEnabled, false);
  assert.equal(configFromEnv({ OPENAI_API_KEY: "fixture-openai" }).apiKey, "");
  assert.equal(
    configFromEnv({ AI_PROVIDER: "openai", GROQ_API_KEY: "fixture-groq" })
      .apiKey,
    "",
  );
  assert.throws(() => configFromEnv({ AI_PROVIDER: "unknown" }));
  assert.throws(() => configFromEnv({ GROQ_SEARCH_ENABLED: "yes" }));
  assert.throws(() => createProvider({ ...groq, provider: "typo" }));
});
test("bozza passa solo da Groq con JSON strict, limiti e dati commerciali minimi", async () => {
  let sent;
  const p = createProvider(groq, {
    fetchImpl: mock(reply(text), (url, init) => (sent = { url, ...init })),
  });
  const result = await p.draft(
    {
      ...partner,
      contactEmail: "private@example.org",
      contactEvidence: "PRIVATE_CONSENT",
      notes: "PRIVATE_NOTE",
    },
    { offer: "Offerta approvata", rules: "Vincoli" },
  );
  assert.equal(sent.url, "https://api.groq.com/openai/v1/chat/completions");
  const body = JSON.parse(sent.body);
  assert.equal(body.model, groq.model);
  assert.equal(body.max_completion_tokens, 2048);
  assert.equal(body.response_format.json_schema.strict, true);
  assert.equal(body.tools, undefined);
  assert.equal(body.compound_custom, undefined);
  for (const value of [
    "private@example.org",
    "PRIVATE_CONSENT",
    "PRIVATE_NOTE",
    groq.apiKey,
  ])
    assert.ok(!sent.body.includes(value));
  assert.deepEqual(result.usage, { input_tokens: 12, output_tokens: 34 });
  assert.equal(result.subject, text.subject);
});
test("nessuna chiamata senza chiave, in preview o con ricerca non abilitata", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls++;
    throw Error("must not run");
  };
  for (const c of [
    { ...groq, apiKey: "" },
    { ...groq, preview: true },
  ])
    await assert.rejects(
      createProvider(c, { fetchImpl }).draft(partner, { offer: "", rules: "" }),
    );
  await assert.rejects(
    createProvider(groq, { fetchImpl }).research(research),
    /disattivata/,
  );
  assert.equal(calls, 0);
});
test("429, 401 e errori Groq non divulgano risposte grezze, non fanno retry o fallback", async () => {
  for (const status of [401, 429, 500]) {
    const urls = [];
    const p = createProvider(groq, {
      fetchImpl: async (url) => {
        urls.push(url);
        return {
          ok: false,
          status,
          json: async () => ({ secret: groq.apiKey }),
        };
      },
    });
    await assert.rejects(
      p.draft(partner, { offer: "", rules: "" }),
      (e) => !e.message.includes(groq.apiKey) && /Groq/.test(e.message),
    );
    assert.deepEqual(urls, ["https://api.groq.com/openai/v1/chat/completions"]);
  }
});
test("risposte incomplete, JSON corrotto e bozze fuori schema vengono respinte", async () => {
  const incomplete = reply(text);
  incomplete.choices[0].finish_reason = "length";
  assert.throws(() => parseGroqOutput(incomplete));
  const prose = reply(text);
  prose.choices[0].message.content =
    "Ecco: " + prose.choices[0].message.content;
  assert.throws(() => parseGroqOutput(prose));
  const fenced = reply(text);
  fenced.choices[0].message.content =
    "```json\n" + fenced.choices[0].message.content + "\n```";
  assert.deepEqual(parseGroqOutput(fenced), text);
  await assert.rejects(
    createProvider(groq, {
      fetchImpl: mock(reply({ ...text, subject: "x".repeat(141) })),
    }).draft(partner, { offer: "", rules: "" }),
    /non valida/,
  );
});
test("ricerca opzionale usa Compound Mini e solo web_search; URL verificate nei metadati", async () => {
  let body;
  const response = searchReply([
    { ...entry, country: "IT" },
    {
      ...entry,
      country: "IT",
      company: "Inventata",
      sourceUrl: "https://example.net/unverified",
    },
  ]);
  const p = createProvider(
    { ...groq, searchEnabled: true },
    { fetchImpl: mock(response, (_u, init) => (body = JSON.parse(init.body))) },
  );
  const result = await p.research(research);
  assert.equal(body.model, GROQ_SEARCH_MODEL);
  assert.deepEqual(body.compound_custom.tools.enabled_tools, ["web_search"]);
  assert.equal(body.response_format, undefined);
  assert.equal(body.search_settings.country, "italy");
  assert.equal(result.partners.length, 1);
  assert.equal(result.discarded, 1);
});
test("senza metadati di ricerca il testo del modello non diventa una fonte", async () => {
  const r = reply({ partners: [{ ...entry, country: "IT" }] });
  r.choices[0].message.reasoning = "URL: " + partner.sourceUrl;
  assert.deepEqual(groqSearchSources(r), { searched: false, urls: [] });
  await assert.rejects(
    createProvider(
      { ...groq, searchEnabled: true },
      { fetchImpl: mock(r) },
    ).research(research),
    /strumento web/,
  );
  const empty = reply({ partners: [] }, [{ search_results: { results: [] } }]);
  assert.equal(
    (
      await createProvider(
        { ...groq, searchEnabled: true },
        { fetchImpl: mock(empty) },
      ).research(research)
    ).partners.length,
    0,
  );
});
test("richiesta Groq può essere annullata senza retry", async () => {
  const controller = new AbortController();
  const p = createProvider(groq, {
    fetchImpl: async (_u, init) =>
      new Promise((_resolve, reject) =>
        init.signal.addEventListener("abort", () => reject(Error("aborted")), {
          once: true,
        }),
      ),
  });
  const pending = p.draft(partner, { offer: "", rules: "" }, controller.signal);
  controller.abort();
  await assert.rejects(pending, /annullata/);
});
test("API distingue bozze Groq e ricerca, non espone la chiave e non crea job disabilitati", async (t) => {
  let calls = 0;
  const f = await fixture(
    t,
    groq,
    createProvider(groq, { fetchImpl: mock(reply(text), () => calls++) }),
  );
  await f.login();
  const state = await (await f.request("/state")).json();
  assert.equal(state.agent.provider, "groq");
  assert.equal(state.agent.draftEnabled, true);
  assert.equal(state.agent.researchEnabled, false);
  assert.ok(!JSON.stringify(state).includes(groq.apiKey));
  assert.equal(
    (await f.request("/research", { method: "POST", body: research })).status,
    409,
  );
  assert.equal(f.store.jobs().length, 0);
  assert.equal(f.store.callCount(), 0);
  f.store.setKnowledge({
    offer: "Offerta verificata",
    rules: "Vincoli",
    approved: true,
  });
  const p = f.store.addPartner(partner);
  assert.equal(
    (
      await f.request("/partners/" + p.id + "/drafts", {
        method: "POST",
        body: {},
      })
    ).status,
    202,
  );
  await idle(f.agent);
  assert.equal(calls, 1);
  assert.equal(f.store.drafts()[0].status, "review");
  assert.equal(f.store.jobs()[0].provider, "groq");
  assert.equal(f.store.jobs()[0].model, groq.model);
});
