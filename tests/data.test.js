import test from "node:test";
import assert from "node:assert/strict";
import {
  departments,
  initialLeads,
  filterLeads,
  reportLines,
} from "../src/data.js";

test("eight departments contain exactly 67 agents, including 4 orchestrators", () => {
  assert.equal(departments.length, 8);
  assert.equal(
    departments.reduce((total, department) => total + department.count, 0),
    67,
  );
  assert.equal(departments.at(-1).count, 4);
});
test("search handles case and whitespace across company, city and person", () => {
  assert.equal(filterLeads(initialLeads, "  NEXORA ")[0].id, 2);
  assert.equal(filterLeads(initialLeads, "torino")[0].id, 3);
  assert.equal(filterLeads(initialLeads, "giulia")[0].id, 1);
  assert.equal(filterLeads(initialLeads, "non esiste").length, 0);
});
test("status filter combines with search", () => {
  assert.equal(filterLeads(initialLeads, "", "In conversazione").length, 2);
  assert.equal(filterLeads(initialLeads, "roma", "In conversazione").length, 1);
  assert.equal(filterLeads(initialLeads, "roma", "Qualificato").length, 0);
});
test("report contains ten lines and explicitly discloses simulation", () => {
  const lines = reportLines(initialLeads, { name: "Test" });
  assert.equal(lines.length, 10);
  assert.match(lines[0], /simulazione/);
  assert.match(lines[1], /Test/);
  assert.match(lines[7], /1 appuntamenti/);
  assert.match(lines[7], /nessuna prenotazione reale/);
});
test("demo contact addresses use reserved example domains", () => {
  assert.ok(initialLeads.every((lead) => lead.email.endsWith(".example")));
  assert.equal(
    new Set(initialLeads.map((lead) => lead.id)).size,
    initialLeads.length,
  );
});
