import test from "node:test";
import assert from "node:assert/strict";
import {
  createProvider,
  validateResearch,
  providerSources,
  parseOutput,
} from "../server/provider.js";
import { config, partner, response, research, text } from "./helpers.js";

test("accetta soltanto URL effettivamente restituiti dalle fonti del provider", () => {
  const good = { ...partner, country: "IT" },
    fake = {
      ...good,
      company: "Inventata",
      sourceUrl: "https://example.net/fake",
    };
  const r = validateResearch(response([good, fake]), research);
  assert.equal(r.partners.length, 1);
  assert.equal(r.discarded, 1);
});
test("una citazione viene normalizzata, nessuna URL privata accettata", () => {
  const r = {
    output: [
      {
        type: "message",
        content: [
          {
            annotations: [
              {
                type: "url_citation",
                url: "https://example.org/?utm_source=x",
              },
              { type: "url_citation", url: "http://127.0.0.1" },
            ],
          },
        ],
      },
    ],
  };
  assert.deepEqual([...providerSources(r)], ["https://example.org"]);
});
test("filtra regione comune segmento e numero, può restituire zero risultati", () => {
  const r = response();
  assert.equal(
    validateResearch(r, { ...research, region: "Lazio" }).partners.length,
    0,
  );
  assert.equal(
    validateResearch(r, { ...research, city: "Roma" }).partners.length,
    0,
  );
  assert.equal(
    validateResearch(r, { ...research, segment: "pet_shop" }).partners.length,
    0,
  );
  assert.equal(
    validateResearch(
      response([
        { ...partner, country: "IT" },
        { ...partner, country: "IT", company: "Altra" },
      ]),
      { ...research, limit: 1 },
    ).partners.length,
    1,
  );
  assert.equal(validateResearch(response([]), research).partners.length, 0);
});
test("JSON malformato, rifiuto o risposta incompleta non diventa successo", () => {
  assert.throws(() => parseOutput({ status: "incomplete", output: [] }));
  assert.throws(() =>
    parseOutput({
      output: [
        {
          type: "message",
          content: [{ type: "output_text", text: "not json" }],
        },
      ],
    }),
  );
  assert.throws(() => parseOutput({ output: [] }));
});
test("senza credenziali o in preview non parte alcuna richiesta", async () => {
  let calls = 0;
  for (const c of [
    { ...config, apiKey: "" },
    { ...config, model: "" },
    { ...config, preview: true },
  ])
    await assert.rejects(
      createProvider(c, {
        fetchImpl: async () => {
          calls++;
        },
      }).research(research),
    );
  assert.equal(calls, 0);
});
test("Responses usa limiti, store:false, fonti e chiave soltanto server-side", async () => {
  let captured;
  const p = createProvider(config, {
    fetchImpl: async (url, init) => {
      captured = { url, ...init };
      return { ok: true, json: async () => response() };
    },
  });
  const r = await p.research(research);
  const body = JSON.parse(captured.body);
  assert.equal(captured.url, "https://api.openai.com/v1/responses");
  assert.equal(body.store, false);
  assert.equal(body.tools[0].type, "web_search");
  assert.equal(body.tool_choice, "required");
  assert.equal(body.max_tool_calls, 3);
  assert.equal(body.max_output_tokens, 6000);
  assert.ok(body.include.includes("web_search_call.action.sources"));
  assert.equal(r.partners.length, 1);
  assert.ok(!captured.body.includes(config.apiKey));
});
test("bozza non trasmette email, consenso o note interne; nessuno strumento", async () => {
  let body;
  const p = createProvider(config, {
    fetchImpl: async (_u, init) => {
      body = JSON.parse(init.body);
      return {
        ok: true,
        json: async () => ({
          status: "completed",
          output: [
            {
              type: "message",
              content: [{ type: "output_text", text: JSON.stringify(text) }],
            },
          ],
        }),
      };
    },
  });
  await p.draft(
    {
      ...partner,
      contactEmail: "sensitive@example.org",
      contactEvidence: "CONSENSO_RISERVATO",
      notes: "NOTA_RISERVATA",
    },
    { offer: "Offerta approvata", rules: "Nessuna promessa" },
    new AbortController().signal,
  );
  const sent = JSON.stringify(body);
  assert.ok(!sent.includes("sensitive@example.org"));
  assert.ok(!sent.includes("CONSENSO_RISERVATO"));
  assert.ok(!sent.includes("NOTA_RISERVATA"));
  assert.equal(body.tools, undefined);
});
test("errori del provider sono sanitizzati e senza retry", async () => {
  let calls = 0;
  const p = createProvider(config, {
    fetchImpl: async () => {
      calls++;
      return {
        ok: false,
        status: 401,
        json: async () => ({ error: config.apiKey }),
      };
    },
  });
  await assert.rejects(
    p.research(research),
    (e) => !e.message.includes(config.apiKey) && /Chiave/.test(e.message),
  );
  assert.equal(calls, 1);
});
