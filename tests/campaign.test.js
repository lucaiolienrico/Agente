import test from "node:test";
import assert from "node:assert/strict";
import {
  defaultCampaign,
  resolveCampaign,
  campaignContext,
} from "../src/campaign.js";
import { createManager, runAgents, detailedReport } from "../src/agents.js";

test("new sessions target veterinary businesses and pet retail throughout Italy", () => {
  assert.deepEqual(resolveCampaign(), defaultCampaign);
  assert.equal(resolveCampaign().city, "Italia");
  assert.match(
    resolveCampaign().sector,
    /Veterinari, pet shop e negozi di animali/,
  );
  assert.equal(resolveCampaign().offer, "");
});
test("only untouched legacy campaigns migrate, preserving send limits", () => {
  const result = resolveCampaign({
    name: "Nuovi clienti · Italia",
    sector: "Servizi B2B",
    city: "Italia",
    limit: 25,
  });
  assert.equal(result.name, defaultCampaign.name);
  assert.equal(result.limit, 25);
  const custom = {
    name: "Mia campagna",
    sector: "Design",
    city: "Milano",
    limit: 10,
    offer: "Servizio configurato",
  };
  assert.deepEqual(resolveCampaign(custom), custom);
});
test("campaign fields and numeric bounds are normalized without guessing an offer", () => {
  assert.equal(resolveCampaign(null).offer, "");
  assert.equal(resolveCampaign({ limit: 0 }).limit, 40);
  assert.equal(resolveCampaign({ limit: 201 }).limit, 40);
  assert.equal(resolveCampaign({ limit: "18" }).limit, 18);
  assert.equal(resolveCampaign({ offer: "  Test  " }).offer, "Test");
});
test("pet targeting is explicit about overlap, individuals, missing offer and demo limits", () => {
  const context = campaignContext(defaultCampaign);
  assert.match(context, /stessa attività/);
  assert.match(context, /Non includere privati/);
  assert.match(context, /non ancora definita/);
  assert.match(context, /nessuna ricerca reale/);
});
test("agent executions and detailed report capture the campaign without replacing custom tasks", () => {
  const manager = createManager();
  const task = manager.agents[0].task;
  runAgents(manager, true, ["RIC-01"], defaultCampaign);
  assert.equal(manager.agents[0].task, task);
  assert.match(
    manager.agents[0].output,
    /Veterinari, pet shop e negozi di animali/,
  );
  assert.match(manager.agents[0].output, /Territorio: Italia/);
  assert.match(
    detailedReport(manager, true, defaultCampaign),
    /Offerta commerciale: da definire/,
  );
  assert.deepEqual(createManager(JSON.parse(JSON.stringify(manager))), manager);
});
