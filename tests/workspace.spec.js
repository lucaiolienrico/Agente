import { test as base, expect } from "@playwright/test";
import { createStore } from "../server/store.js";
import { createAgent } from "../server/agent.js";
import { createApp } from "../server/app.js";
import { config, partner, text, idle } from "./helpers.js";
import { readFileSync } from "node:fs";

const test = base.extend({
  ai: [false, { option: true }],
  aiProvider: ["openai", { option: true }],
  groqSearch: [false, { option: true }],
  preview: [false, { option: true }],
  workspace: async ({ ai, preview, aiProvider, groqSearch }, use) => {
    const store = createStore(":memory:");
    const cfg = {
      ...config,
      provider: aiProvider,
      searchEnabled: groqSearch,
      apiKey: ai ? "isolated-fixture-key" : "",
      preview,
    };
    const provider = {
      research: async () => ({
        partners: [partner],
        discarded: 0,
        sources: [partner.sourceUrl],
        usage: {},
      }),
      draft: async () => ({ ...text, usage: {} }),
    };
    const agent = createAgent(store, provider, cfg);
    const app = createApp({ store, agent, config: cfg });
    const server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    cfg.origin = `http://127.0.0.1:${server.address().port}`;
    try {
      await use({ store, agent, url: cfg.origin });
    } finally {
      agent.pause(true);
      agent.shutdown();
      await idle(agent);
      await new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      });
      store.close();
    }
  },
});
async function login(page, w) {
  await page.goto(w.url);
  await page.getByLabel("Password amministratore").fill(config.password);
  await page.getByRole("button", { name: "Accedi al workspace" }).click();
  await expect(
    page.getByRole("heading", { name: "Partnership, con criterio." }),
  ).toBeVisible();
}
async function addPartner(page, name = "Struttura di test browser") {
  await page
    .getByRole("button", { name: "Aggiungi struttura", exact: false })
    .first()
    .click();
  const d = page.getByRole("dialog");
  await d.getByLabel("Nome della struttura").fill(name);
  await d.getByLabel("Comune", { exact: true }).fill("Milano");
  await d
    .getByLabel("Fonte pubblica verificabile")
    .fill("https://example.org/struttura");
  await d
    .getByLabel("Evidenze di pertinenza")
    .fill("Fixture di prova. Non è una struttura reale.");
  await d.getByRole("button", { name: "Salva struttura" }).click();
  await expect(d).not.toBeVisible();
}
async function approveKnowledge(page) {
  await page
    .getByRole("link", { name: "Scheda PetNote", exact: false })
    .first()
    .click();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Salva scheda" }).click();
  await expect(page.getByText("Approvata", { exact: true })).toBeVisible();
}

test("login, dashboard vuota e provider non configurato senza attività inventate", async ({
  page,
  workspace,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page, workspace);
  await expect(
    page.getByRole("button", { name: "Avvia ricerca web" }),
  ).toBeDisabled();
  await expect(page.getByText("Nessuna ricerca ancora avviata.")).toBeVisible();
  expect(workspace.store.partners()).toHaveLength(0);
  await page.getByRole("button", { name: "Istruzioni di attivazione" }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "GitHub Pages non può eseguire questo agente",
  );
  await page.getByRole("button", { name: "Ho capito" }).click();
  await page.getByRole("button", { name: "Esci dal workspace" }).click();
  await expect(page.getByLabel("Password amministratore")).toBeVisible();
  expect(errors).toEqual([]);
});
test("aggiunta, persistenza al reload, filtri, verifica umana e protezione XSS", async ({
  page,
  workspace,
}) => {
  await login(page, workspace);
  const name = "<img src=x onerror=alert(1)> TEST";
  await addPartner(page, name);
  await page
    .getByRole("link", { name: "Strutture", exact: false })
    .first()
    .click();
  await expect(page.getByRole("cell", { name, exact: false })).toBeVisible();
  expect(await page.locator("tbody img").count()).toBe(0);
  await page.reload();
  await expect(page.getByRole("cell", { name, exact: false })).toBeVisible();
  await page
    .getByRole("searchbox", { name: "Cerca struttura" })
    .fill("nessun-risultato");
  await expect(
    page.getByText("Nessuna struttura corrisponde ai filtri."),
  ).toBeVisible();
  await page.getByRole("searchbox", { name: "Cerca struttura" }).fill("TEST");
  await page.getByRole("button", { name: "Apri scheda" }).click();
  await page.getByLabel("Qualifica umana").selectOption("qualificato");
  await page.getByRole("button", { name: "Salva struttura" }).click();
  await expect(
    page.getByRole("table").getByText("Qualificato", { exact: true }),
  ).toBeVisible();
  expect(workspace.store.partners()[0].contactBasis).toBe("unknown");
});
test("consenso non documentato mostra errore dentro il dialogo e non salva", async ({
  page,
  workspace,
}) => {
  await login(page, workspace);
  await addPartner(page);
  await page
    .getByRole("link", { name: "Strutture", exact: false })
    .first()
    .click();
  await page.getByRole("button", { name: "Apri scheda" }).click();
  await page.getByLabel("Base documentata").selectOption("consent");
  await page.getByRole("button", { name: "Salva struttura" }).click();
  await expect(page.getByRole("dialog").getByRole("status")).toContainText(
    "Documenta origine",
  );
  expect(workspace.store.partners()[0].contactBasis).toBe("unknown");
});
test("mobile 390px senza overflow, navigazione e scheda prodotto", async ({
  page,
  workspace,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, workspace);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await approveKnowledge(page);
  expect(workspace.store.knowledge().approved).toBe(true);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: ".cache/screenshots/petnote-mobile.png",
    fullPage: true,
  });
});
test.describe("provider isolato di test, mai chiamate esterne", () => {
  test.use({ ai: true });
  test("ricerca → qualifica → bozza → consenso → approvazione → export → opt-out", async ({
    page,
    workspace,
  }) => {
    await login(page, workspace);
    await approveKnowledge(page);
    await page
      .getByRole("link", { name: "Panoramica", exact: false })
      .first()
      .click();
    await page.getByRole("button", { name: "Avvia ricerca web" }).click();
    await idle(workspace.agent);
    await page
      .getByRole("link", { name: "Strutture", exact: false })
      .first()
      .click();
    await expect(
      page.getByText("Struttura di test", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Apri scheda" }).click();
    await page.getByLabel("Qualifica umana").selectOption("qualificato");
    await page.getByRole("button", { name: "Salva struttura" }).click();
    await page.getByRole("button", { name: "Apri scheda" }).click();
    await page.getByRole("button", { name: "Genera bozza IA" }).click();
    await idle(workspace.agent);
    await page
      .getByRole("link", { name: "Bozze e approvazioni", exact: false })
      .first()
      .click();
    await expect(
      page.getByRole("button", { name: "Approva testo" }),
    ).toBeDisabled();
    await expect(
      page.getByText("Documenta una richiesta pertinente", { exact: false }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Apri struttura" }).click();
    await page.getByLabel("Base documentata").selectOption("inbound");
    await page.getByLabel("Email professionale").fill("test@example.org");
    await page
      .getByLabel("Origine, data e ambito")
      .fill(
        "Richiesta pertinente ricevuta il 17/09/2026, esclusivamente fixture browser.",
      );
    await page.getByRole("button", { name: "Salva struttura" }).click();
    await page.getByRole("checkbox").check();
    await page
      .getByLabel("Oggetto", { exact: true })
      .fill("Testo revisionato dalla persona");
    await page.getByRole("button", { name: "Approva testo" }).click();
    await expect(page.getByText("Approvata", { exact: true })).toBeVisible();
    const downloadEvent = page.waitForEvent("download");
    await page.getByRole("link", { name: "Scarica testo approvato" }).click();
    const download = await downloadEvent;
    const content = readFileSync(await download.path(), "utf8");
    expect(content).toContain("NON INVIATA");
    expect(content).toContain("Testo revisionato dalla persona");
    await page
      .getByRole("link", { name: "Strutture", exact: false })
      .first()
      .click();
    await page.getByRole("button", { name: "Apri scheda" }).click();
    await page.getByLabel("Base documentata").selectOption("opt_out");
    await page.getByRole("button", { name: "Salva struttura" }).click();
    await page
      .getByRole("link", { name: "Bozze e approvazioni", exact: false })
      .first()
      .click();
    await expect(
      page.getByRole("button", { name: "Approva testo" }),
    ).toBeDisabled();
    await expect(
      page.getByRole("link", { name: "Scarica testo approvato" }),
    ).toHaveCount(0);
    expect(workspace.store.drafts()[0].status).toBe("review");
  });
});
test.describe("anteprima esplicitamente aperta", () => {
  test.use({ ai: true, preview: true });
  test("login bypass separato e IA bloccata anche con chiave presente", async ({
    page,
    workspace,
  }) => {
    await page.goto(workspace.url);
    await expect(
      page.getByText("Anteprima aperta · Non inserire dati riservati.", {
        exact: false,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Avvia ricerca web" }),
    ).toBeDisabled();
    expect(workspace.store.jobs()).toHaveLength(0);
    await page.screenshot({
      path: ".cache/screenshots/petnote-desktop.png",
      fullPage: true,
    });
  });
});
test("Pages root e docs sono un avviso, non la console o un redirect", async () => {
  for (const filename of ["index.html", "docs/index.html"]) {
    const html = readFileSync(filename, "utf8");
    expect(html).toContain("Questa pagina non è l’agente attivo");
    expect(html).not.toContain('http-equiv="refresh"');
    expect(html).not.toContain("/assets/");
    expect(html).not.toContain("OPENAI_API_KEY=sk-");
  }
});

test.describe("Groq, capacità separate", () => {
  test.use({ ai: true, aiProvider: "groq" });
  test("bozze abilitate ma ricerca spenta, messaggi Groq corretti", async ({
    page,
    workspace,
  }) => {
    await login(page, workspace);
    await expect(
      page.getByRole("button", { name: "Avvia ricerca web" }),
    ).toBeDisabled();
    await expect(
      page.getByText("Groq è disponibile per le bozze.", { exact: false }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Istruzioni di attivazione" })
      .click();
    await expect(page.getByRole("dialog")).toContainText("GROQ_API_KEY");
    await expect(page.getByRole("dialog")).not.toContainText("Collega OpenAI");
    await page.getByRole("button", { name: "Ho capito" }).click();
    await approveKnowledge(page);
    await page
      .getByRole("link", { name: "Strutture", exact: false })
      .first()
      .click();
    await addPartner(page);
    await page.getByRole("button", { name: "Apri scheda" }).click();
    await expect(
      page.getByRole("button", { name: "Genera bozza IA" }),
    ).toBeEnabled();
    await page.getByRole("button", { name: "Genera bozza IA" }).click();
    await idle(workspace.agent);
    await page
      .getByRole("link", { name: "Bozze e approvazioni", exact: false })
      .first()
      .click();
    await expect(page.getByLabel("Oggetto", { exact: true })).toHaveValue(
      text.subject,
    );
    await expect(
      page.getByRole("button", { name: "Approva testo" }),
    ).toBeDisabled();
  });
});
