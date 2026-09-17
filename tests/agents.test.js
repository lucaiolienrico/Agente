import test from "node:test";
import assert from "node:assert/strict";
import { departments } from "../src/data.js";
import {
  catalog,
  createManager,
  agentMetrics,
  agentStatus,
  filterAgents,
  setEnabled,
  updateAgent,
  runAgents,
  reviewAgent,
  requeueAgent,
  logEvent,
  detailedReport,
} from "../src/agents.js";

test("catalog has 67 unique identities and distinct roles matching department counts", () => {
  assert.equal(catalog.length, 67);
  assert.equal(new Set(catalog.map((a) => a.id)).size, 67);
  assert.equal(new Set(catalog.map((a) => a.role)).size, 67);
  departments.forEach((d) =>
    assert.equal(
      catalog.filter((a) => a.department === d.name).length,
      d.count,
    ),
  );
});
test("restore validates data, preserves canonical identities and supports legacy empty state", () => {
  for (const value of [undefined, null, {}, { agents: "bad" }])
    assert.equal(createManager(value).agents.length, 67);
  const m = createManager({
    agents: [
      {
        id: "RIC-01",
        department: "Hacked",
        enabled: false,
        priority: "Invalid",
        completed: -1,
        taskState: "Invia",
        lastRun: "invalid",
      },
    ],
    audit: [null, { message: "x" }],
  });
  const a = m.agents.find((a) => a.id === "RIC-01");
  assert.equal(a.department, "Ricerca");
  assert.equal(a.enabled, false);
  assert.equal(a.priority, "Normale");
  assert.equal(a.completed, 0);
  assert.equal(a.taskState, "In coda");
  assert.equal(a.lastRun, null);
  assert.equal(m.audit.length, 0);
});
test("filters combine search, department, workflow and effective global pause", () => {
  const m = createManager();
  setEnabled(m, ["RIC-01"], false);
  assert.equal(
    filterAgents(m.agents, {
      query: " ric-01 ",
      department: "Ricerca",
      status: "In pausa",
    }).length,
    1,
  );
  assert.equal(
    filterAgents(m.agents, { department: "Messaggi", status: "In coda" })
      .length,
    15,
  );
  assert.equal(
    filterAgents(m.agents, { status: "Pausa globale" }, false).length,
    67,
  );
  assert.equal(
    filterAgents(m.agents, { status: "Abilitato" }, false).length,
    0,
  );
});
test("global pause wins without resetting individual switches and produces no runs", () => {
  const m = createManager();
  setEnabled(m, ["RIC-01"], false);
  assert.equal(agentMetrics(m, false).paused, 67);
  assert.equal(agentMetrics(m, true).paused, 1);
  assert.equal(agentStatus(m.agents[0], false), "Pausa globale");
  assert.equal(runAgents(m, false).processed, 0);
  assert.equal(agentMetrics(m, true).runs, 0);
});
test("bulk toggles are scoped and idempotent", () => {
  const m = createManager();
  assert.equal(setEnabled(m, ["RIC-01", "RIC-02"], false), 2);
  assert.equal(setEnabled(m, ["RIC-01", "RIC-02"], false), 0);
  assert.equal(m.audit.length, 2);
  assert.equal(agentMetrics(m, true).enabled, 65);
});
test("cycle honors priority, five-task cap and selection boundaries", () => {
  const m = createManager();
  const a = m.agents.find((a) => a.id === "RIC-01");
  updateAgent(m, a.id, { ...a, priority: "Alta" });
  assert.equal(runAgents(m, true).processed, 5);
  assert.equal(a.runs, 1);
  assert.equal(agentMetrics(m, true).runs, 5);
  const next = createManager();
  runAgents(next, true, ["RIC-02"]);
  assert.equal(next.agents.find((a) => a.id === "RIC-02").completed, 1);
  assert.equal(agentMetrics(next, true).runs, 1);
});
test("paused, completed and pending-review tasks cannot run again implicitly", () => {
  const m = createManager();
  setEnabled(m, ["RIC-01"], false);
  runAgents(m, true, ["RIC-01", "RIC-02", "MES-01"]);
  assert.equal(runAgents(m, true, ["RIC-01", "RIC-02", "MES-01"]).processed, 0);
  assert.equal(agentMetrics(m, true).runs, 2);
});
test("sensitive departments require approval; approval is idempotent and requeue explicit", () => {
  const m = createManager();
  const ids = ["MES-01", "RIS-01", "AGE-01", "NUT-01"];
  assert.equal(runAgents(m, true, ids).review, 4);
  assert.equal(agentMetrics(m, true).completed, 0);
  assert.ok(reviewAgent(m, "MES-01", true));
  assert.equal(reviewAgent(m, "MES-01", true), false);
  assert.equal(agentMetrics(m, true).completed, 1);
  assert.ok(requeueAgent(m, "MES-01"));
  assert.equal(runAgents(m, true, ["MES-01"]).review, 1);
});
test("rejection requeues without counting completion and clears obsolete output", () => {
  const m = createManager();
  runAgents(m, true, ["MES-01"]);
  reviewAgent(m, "MES-01", false);
  const a = m.agents.find((a) => a.id === "MES-01");
  assert.equal(a.taskState, "In coda");
  assert.equal(a.output, "");
  assert.equal(a.completed, 0);
});
test("new assignment resets workflow while preserving cumulative history", () => {
  const m = createManager();
  const a = m.agents.find((a) => a.id === "RIC-01");
  runAgents(m, true, [a.id]);
  updateAgent(m, a.id, { ...a, task: "Analizza solo un esempio fittizio." });
  assert.equal(a.taskState, "In coda");
  assert.equal(a.output, "");
  assert.equal(a.completed, 1);
  assert.throws(() => updateAgent(m, a.id, { ...a, task: "   " }));
});
test("local persistence roundtrip retains settings, audit and counters", () => {
  const m = createManager();
  runAgents(m, true, ["RIC-01"]);
  setEnabled(m, ["MES-01"], false);
  assert.deepEqual(createManager(JSON.parse(JSON.stringify(m))), m);
});
test("audit retention is capped and report includes real console counts and all IDs", () => {
  const m = createManager();
  for (let i = 0; i < 310; i++) logEvent(m, "SISTEMA", `Evento ${i}`);
  assert.equal(m.audit.length, 300);
  assert.equal(m.audit[0].message, "Evento 309");
  runAgents(m, true, ["RIC-01"]);
  const report = detailedReport(
    m,
    true,
    {
      name: "Test | azienda\n# injection",
      sector: "Design",
      city: "Milano",
      limit: 40,
    },
    new Date("2026-09-16T14:00:00Z"),
  );
  assert.match(
    report,
    /Esecuzioni demo cumulative: 1; completamenti cumulativi: 1/,
  );
  assert.match(report, /Email reali inviate: 0/);
  assert.equal(
    report.split("\n").filter((line) => /^\| [A-Z]{3}-\d\d \|/.test(line))
      .length,
    67,
  );
  assert.ok(report.includes("Test \\| azienda \\# injection"));
});
