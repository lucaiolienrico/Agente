import test from "node:test";
import assert from "node:assert/strict";
import { fixture, partner, text, idle, research, config } from "./helpers.js";

test("archivio protetto e sessioni HttpOnly, hash server-side e logout", async (t) => {
  const f = await fixture(t);
  assert.equal((await f.request("/state")).status, 401);
  const login = await f.login();
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie");
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  assert.ok(
    !f.store.db
      .prepare("SELECT hash FROM sessions")
      .get()
      .hash.includes(f.getCookie().split("=")[1]),
  );
  const state = await (await f.request("/state")).json();
  assert.deepEqual(state.partners, []);
  assert.ok(!JSON.stringify(state).includes(config.apiKey));
  assert.equal(
    (await f.request("/logout", { method: "POST", body: {} })).status,
    200,
  );
  assert.equal((await f.request("/state")).status, 401);
});
test("cookie Secure in produzione e sessione scaduta respinta", async (t) => {
  const f = await fixture(t, {
    production: true,
    origin: "https://example.org",
  });
  assert.match((await f.login()).headers.get("set-cookie"), /Secure/);
  f.store.db.prepare("UPDATE sessions SET expires=0").run();
  assert.equal((await f.request("/state")).status, 401);
});
test("controlli CSRF, content-type, JSON e validazione prima delle mutazioni", async (t) => {
  const f = await fixture(t);
  await f.login();
  assert.equal(
    (
      await f.request("/partners", {
        method: "POST",
        body: partner,
        origin: "https://evil.example.org",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await f.request("/partners", {
        method: "POST",
        body: partner,
        origin: "",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await f.request("/partners", {
        method: "POST",
        body: partner,
        headers: { "Content-Type": "text/plain" },
      })
    ).status,
    415,
  );
  assert.equal(
    (
      await f.request("/partners", {
        method: "POST",
        body: { ...partner, sourceUrl: "javascript:alert(1)" },
      })
    ).status,
    400,
  );
  assert.equal(f.store.partners().length, 0);
});
test("limite di login globale non eludibile con X-Forwarded-For", async (t) => {
  const f = await fixture(t);
  for (let i = 0; i < 10; i++)
    assert.equal(
      (
        await f.request("/login", {
          method: "POST",
          body: { password: "wrong" },
          headers: { "X-Forwarded-For": `10.0.0.${i}` },
        })
      ).status,
      401,
    );
  assert.equal((await f.login()).status, 429);
});
test("CRUD commerciale, duplicati e CSV protetto da formule", async (t) => {
  const f = await fixture(t);
  await f.login();
  let r = await f.request("/partners", {
    method: "POST",
    body: { ...partner, company: "=FORMULA TEST" },
  });
  assert.equal(r.status, 201);
  const p = await r.json();
  assert.equal(
    (
      await f.request("/partners", {
        method: "POST",
        body: { ...partner, company: "=FORMULA TEST" },
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await f.request("/partners/" + p.id, {
        method: "PUT",
        body: { ...partner, status: "qualificato" },
      })
    ).status,
    200,
  );
  const csv = await f.request("/export/partners.csv");
  assert.equal(csv.status, 200);
  assert.match(csv.headers.get("content-disposition"), /attachment/);
  assert.match(await csv.text(), /Struttura di test/);
});
test("approvazione/export richiedono tutti i gate, opt-out revoca e blocca", async (t) => {
  const f = await fixture(t);
  await f.login();
  f.store.setKnowledge({
    offer: "Offerta verificata",
    rules: "Vincoli",
    approved: true,
  });
  const p = f.store.addPartner(partner);
  const d = f.store.addDraft(p.id, text, 2, "test-job");
  const approve = () =>
    f.request("/drafts/" + d.id + "/approve", {
      method: "POST",
      body: { confirmed: true },
    });
  assert.equal((await approve()).status, 409);
  assert.equal((await f.request("/drafts/" + d.id + "/export")).status, 409);
  const contact = {
    ...partner,
    status: "qualificato",
    contactBasis: "inbound",
    contactEvidence:
      "Richiesta di informazioni ricevuta il 17/09/2026, fixture test.",
    contactEmail: "test@example.org",
  };
  await f.request("/partners/" + p.id, { method: "PUT", body: contact });
  assert.equal(
    (
      await f.request("/drafts/" + d.id + "/approve", {
        method: "POST",
        body: {},
      })
    ).status,
    400,
  );
  assert.equal((await approve()).status, 200);
  const out = await f.request("/drafts/" + d.id + "/export");
  assert.equal(out.status, 200);
  assert.match(await out.text(), /NON INVIATA/);
  await f.request("/partners/" + p.id, {
    method: "PUT",
    body: { ...contact, contactBasis: "opt_out" },
  });
  assert.equal(f.store.draft(d.id).status, "review");
  assert.equal((await approve()).status, 409);
  assert.equal((await f.request("/drafts/" + d.id + "/export")).status, 409);
  assert.equal(
    (
      await f.request("/partners/" + p.id + "/drafts", {
        method: "POST",
        body: {},
      })
    ).status,
    409,
  );
});
test("cambio scheda e modifica testo invalidano approvazioni", async (t) => {
  const f = await fixture(t);
  await f.login();
  const k = f.store.setKnowledge({
    offer: "Offerta verificata",
    rules: "Vincoli",
    approved: true,
  });
  const p = f.store.addPartner({
    ...partner,
    status: "qualificato",
    contactBasis: "consent",
    contactEvidence: "Consenso documentato soltanto per il test",
    contactEmail: "test@example.org",
  });
  const d = f.store.addDraft(p.id, text, k.version, "test-job");
  await f.request("/drafts/" + d.id + "/approve", {
    method: "POST",
    body: { confirmed: true },
  });
  assert.equal(f.store.draft(d.id).status, "approved");
  await f.request("/drafts/" + d.id, {
    method: "PUT",
    body: { ...text, subject: "Oggetto aggiornato" },
  });
  assert.equal(f.store.draft(d.id).status, "review");
  await f.request("/drafts/" + d.id + "/approve", {
    method: "POST",
    body: { confirmed: true },
  });
  await f.request("/knowledge", {
    method: "PUT",
    body: {
      offer: "Nuova offerta verificata",
      rules: "Vincoli",
      approved: true,
    },
  });
  assert.equal(f.store.draft(d.id).status, "review");
  assert.equal(
    (
      await f.request("/drafts/" + d.id + "/approve", {
        method: "POST",
        body: { confirmed: true },
      })
    ).status,
    409,
  );
});
test("ricerca API esegue il worker e traccia risultati reali della fixture", async (t) => {
  const f = await fixture(t);
  await f.login();
  const r = await f.request("/research", { method: "POST", body: research });
  assert.equal(r.status, 202);
  await idle(f.agent);
  const state = await (await f.request("/state")).json();
  assert.equal(state.partners.length, 1);
  assert.equal(state.partners[0].origin, "ai");
  assert.equal(state.partners[0].status, "da_verificare");
  assert.equal(state.jobs[0].status, "completed");
});
test("preview e provider assente non simulano lavori o risultati", async (t) => {
  for (const cfg of [{ preview: true }, { apiKey: "" }]) {
    const f = await fixture(t, cfg);
    await f.login();
    const r = await f.request("/research", { method: "POST", body: research });
    assert.ok([409, 503].includes(r.status));
    assert.equal(f.store.jobs().length, 0);
    assert.equal(f.store.callCount(), 0);
  }
});
test("nessun endpoint di invio, header anti-cache e CSP sicura", async (t) => {
  const f = await fixture(t);
  await f.login();
  assert.equal(
    (await f.request("/send", { method: "POST", body: {} })).status,
    404,
  );
  const r = await f.request("/state");
  assert.match(r.headers.get("cache-control"), /no-store/);
  assert.match(r.headers.get("content-security-policy"), /script-src 'self'/);
  assert.ok(
    !r.headers.get("content-security-policy").includes("unsafe-inline"),
  );
});
