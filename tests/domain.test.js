import test from "node:test";
import assert from "node:assert/strict";
import {
  safeURL,
  duplicateKey,
  parse,
  partnerSchema,
  researchSchema,
  canApprove,
  defaultKnowledge,
} from "../server/domain.js";
import { configFromEnv, csvCell } from "../server/app.js";
import { partner } from "./helpers.js";

test("URL pubblici normalizzati, senza tracking e frammenti", () => {
  assert.equal(
    safeURL("https://example.org/struttura/?utm_source=a&x=1#contatti"),
    "https://example.org/struttura/?x=1",
  );
  assert.equal(safeURL("https://example.org/"), "https://example.org");
});
test("URL pericolosi, privati e credenziali rifiutati", () => {
  for (const u of [
    "javascript:alert(1)",
    "file:///etc/passwd",
    "http://127.0.0.1",
    "http://2130706433",
    "http://[::1]",
    "http://10.1.2.3",
    "http://localhost",
    "http://app.internal",
    "http://example.org:3000",
    "https://user:password@example.org",
  ])
    assert.equal(safeURL(u), null, u);
});
test("deduplica nome/città, ignorando accenti spazi e punteggiatura", () => {
  assert.equal(
    duplicateKey({ company: "Clínica Uno S.r.l.", city: "Forlì" }),
    duplicateKey({ company: "CLINICA UNO SRL", city: "Forli" }),
  );
  assert.notEqual(
    duplicateKey(partner),
    duplicateKey({ ...partner, city: "Roma" }),
  );
});
test("ricerca limitata a 5 e regioni italiane", () => {
  assert.throws(() =>
    parse(researchSchema, {
      segment: "entrambi",
      region: "Tutta Italia",
      limit: 6,
    }),
  );
  assert.throws(() =>
    parse(researchSchema, { segment: "entrambi", region: "Londra", limit: 1 }),
  );
});
test("il consenso richiede documentazione e la fonte deve essere pubblica", () => {
  assert.throws(() =>
    parse(partnerSchema, { ...partner, contactBasis: "consent" }),
  );
  assert.throws(() =>
    parse(partnerSchema, { ...partner, sourceUrl: "http://localhost" }),
  );
  assert.throws(() =>
    parse(partnerSchema, { ...partner, extra: "non previsto" }),
  );
  assert.equal(parse(partnerSchema, partner).contactBasis, "unknown");
});
test("approvazione separa qualifica e base di contatto", () => {
  const k = { ...defaultKnowledge, approved: true };
  assert.match(canApprove(partner, k), /qualificata/);
  assert.match(
    canApprove({ ...partner, status: "qualificato" }, k),
    /consenso/,
  );
  const p = {
    ...partner,
    status: "qualificato",
    contactBasis: "inbound",
    contactEvidence: "Richiesta ricevuta e pertinente il 17 settembre 2026.",
    contactEmail: "test@example.org",
  };
  assert.equal(canApprove(p, k), null);
  assert.match(canApprove({ ...p, contactBasis: "opt_out" }, k), /consenso/);
  assert.match(canApprove(p, defaultKnowledge), /scheda/);
});
test("produzione rifiuta bypass, HTTP e password deboli", () => {
  for (const env of [
    { NODE_ENV: "production" },
    {
      NODE_ENV: "production",
      ADMIN_PASSWORD: "very-long-password",
      APP_ORIGIN: "http://example.org",
    },
    {
      NODE_ENV: "production",
      ADMIN_PASSWORD: "very-long-password",
      APP_ORIGIN: "https://example.org",
      DEV_AUTH_BYPASS: "true",
    },
  ])
    assert.throws(() => configFromEnv(env));
  assert.equal(
    configFromEnv({
      NODE_ENV: "production",
      ADMIN_PASSWORD: "very-long-password",
      APP_ORIGIN: "https://example.org",
    }).production,
    true,
  );
  assert.throws(() => configFromEnv({ DAILY_AI_LIMIT: "0" }));
  assert.throws(() =>
    configFromEnv({ APP_ORIGIN: "https://example.org/path" }),
  );
});
test("CSV neutralizza formule, ritorni a capo e virgolette", () => {
  assert.equal(csvCell('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"');
  assert.ok(csvCell("  +CMD").startsWith("\"'"));
  assert.equal(csvCell("normale"), '"normale"');
  assert.ok(csvCell("\n=1").startsWith("\"'"));
});
