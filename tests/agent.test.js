import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { setImmediate as tick } from "node:timers/promises";
import { createStore } from "../server/store.js";
import { createAgent } from "../server/agent.js";
import { config, partner, research, text, idle } from "./helpers.js";
function setup(t, provider, cfg = config) {
  const store = createStore(":memory:");
  const agent = createAgent(store, provider, cfg);
  t.after(async () => {
    agent.pause(true);
    await idle(agent);
    store.close();
  });
  return { store, agent };
}
const result = {
  partners: [partner],
  discarded: 0,
  sources: [partner.sourceUrl],
  usage: { input_tokens: 10, output_tokens: 20 },
};
test("ricerca importa dati da verificare e deduplica senza modificare il consenso", async (t) => {
  const { store, agent } = setup(t, { research: async () => result });
  let j = agent.enqueueResearch(research);
  await idle(agent);
  assert.equal(store.job(j.id).result.added, 1);
  const p = store.partners()[0];
  store.updatePartner(p.id, { ...partner, contactBasis: "opt_out" });
  j = agent.enqueueResearch(research);
  await idle(agent);
  assert.equal(store.job(j.id).result.duplicates, 1);
  assert.equal(store.partners().length, 1);
  assert.equal(store.partners()[0].contactBasis, "opt_out");
  assert.equal(store.callCount(), 2);
});
test("singolo worker, cap giornaliero e limite includono tentativi falliti", async (t) => {
  let running = 0,
    max = 0;
  const { store, agent } = setup(
    t,
    {
      research: async () => {
        running++;
        max = Math.max(max, running);
        await tick();
        running--;
        throw new Error("secret internal detail");
      },
    },
    { ...config, dailyLimit: 2 },
  );
  agent.enqueueResearch(research);
  agent.enqueueResearch(research);
  assert.throws(() => agent.enqueueResearch(research), /giornaliero/);
  await idle(agent);
  assert.equal(max, 1);
  assert.equal(store.callCount(), 2);
  assert.ok(
    store
      .jobs()
      .every((j) => j.status === "failed" && !j.error.includes("secret")),
  );
});
test("annullamento impedisce import anche se il provider ignora abort", async (t) => {
  let finish;
  const { store, agent } = setup(t, {
    research: () => new Promise((resolve) => (finish = resolve)),
  });
  const j = agent.enqueueResearch(research);
  await tick();
  agent.cancel(j.id);
  finish(result);
  await idle(agent);
  assert.equal(store.job(j.id).status, "cancelled");
  assert.equal(store.partners().length, 0);
  assert.equal(store.callCount(), 1);
});
test("pausa annulla coda e lavoro attivo, non rilancia alla ripresa", async (t) => {
  let finish;
  const { store, agent } = setup(t, {
    research: () => new Promise((resolve) => (finish = resolve)),
  });
  agent.enqueueResearch(research);
  agent.enqueueResearch(research);
  await tick();
  agent.pause(true);
  finish(result);
  await idle(agent);
  assert.ok(store.jobs().every((j) => j.status === "cancelled"));
  assert.throws(() => agent.enqueueResearch(research), /pausa/);
  agent.pause(false);
  await tick();
  assert.equal(store.callCount(), 1);
});
test("provider assente e preview rifiutano prima di creare job o spendere", (t) => {
  for (const cfg of [
    { ...config, preview: true },
    { ...config, apiKey: "" },
  ]) {
    const { store, agent } = setup(
      t,
      {
        research: () => {
          throw Error("must not run");
        },
      },
      cfg,
    );
    assert.throws(() => agent.enqueueResearch(research));
    assert.equal(store.jobs().length, 0);
    assert.equal(store.callCount(), 0);
  }
});
test("bozze richiedono scheda approvata e non vengono inviate", async (t) => {
  const { store, agent } = setup(t, {
    draft: async () => ({ ...text, usage: {} }),
  });
  const p = store.addPartner(partner);
  assert.throws(() => agent.enqueueDraft(p.id), /scheda/);
  store.setKnowledge({
    offer: "Offerta confermata",
    rules: "Nessuna promessa",
    approved: true,
  });
  const j = agent.enqueueDraft(p.id);
  await idle(agent);
  assert.equal(store.job(j.id).status, "completed");
  assert.equal(store.drafts()[0].status, "review");
  assert.equal(store.drafts()[0].knowledgeVersion, 2);
});
test("opt-out o cambio scheda durante generazione impedisce salvataggio", async (t) => {
  let finish;
  const { store, agent } = setup(t, {
    draft: () => new Promise((resolve) => (finish = resolve)),
  });
  const p = store.addPartner(partner);
  store.setKnowledge({ offer: "Offerta", rules: "Vincoli", approved: true });
  const j = agent.enqueueDraft(p.id);
  await tick();
  store.updatePartner(p.id, { ...partner, contactBasis: "opt_out" });
  finish({ ...text, usage: {} });
  await idle(agent);
  assert.equal(store.job(j.id).status, "failed");
  assert.equal(store.drafts().length, 0);
});
test("persistenza e riavvio non ripetono lavori a pagamento", () => {
  const dir = mkdtempSync(join(tmpdir(), "petnote-store-"));
  try {
    let store = createStore(join(dir, "store.sqlite"));
    store.addPartner(partner);
    const j = store.addJob("research", research);
    store.updateJob(j.id, { status: "running" });
    store.startCall();
    store.close();
    store = createStore(join(dir, "store.sqlite"));
    store.recover();
    assert.equal(store.partners().length, 1);
    assert.equal(store.job(j.id).status, "failed");
    assert.equal(store.callCount(), 1);
    assert.match(store.job(j.id).error, /riavvio/);
    store.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
