import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";

async function navigate(page) {
  await page.locator('.sidebar [data-page="Gestione agenti"]').click();
}
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await navigate(page);
});

test("console lists 67 agents and combines department, text and status filters", async ({
  page,
}) => {
  await expect(page.locator("#agent-rows tr")).toHaveCount(67);
  await page.locator('[data-console-department="Messaggi"]').click();
  await expect(page.locator("#agent-rows tr")).toHaveCount(15);
  await page.getByLabel("Cerca agenti", { exact: true }).fill("MES-15");
  await expect(page.locator("#agent-rows tr")).toHaveCount(1);
  await expect(page.locator("#agent-rows")).toContainText(
    "Controllo finale del tono",
  );
  await page.getByLabel("Filtra stato agente").selectOption("In pausa");
  await expect(
    page.getByText("Nessun agente corrisponde ai filtri."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Azzera filtri" }).click();
  await expect(page.locator("#agent-rows tr")).toHaveCount(67);
});

test("bulk pause applies only to selected visible agents and persists", async ({
  page,
}) => {
  await page.locator('[data-console-department="Ricerca"]').click();
  await page
    .getByLabel("Seleziona tutti gli agenti visibili", { exact: true })
    .check();
  await page
    .getByRole("button", { name: "Pausa selezionati", exact: true })
    .click();
  await expect(page.locator("#agent-rows .status-badge.stone")).toHaveCount(12);
  await page.locator('[data-console-department="Qualifica"]').click();
  await expect(page.locator("#agent-rows .status-badge.sage")).toHaveCount(9);
  await expect(
    page.getByRole("button", { name: "Pausa selezionati", exact: true }),
  ).toBeDisabled();
  await page.reload();
  await navigate(page);
  await expect(page.locator(".console-stat").first()).toContainText("55");
});

test("global pause blocks execution but individual states survive resume", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "Sospendi RIC-01", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Pausa globale", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Esegui su 67 visibili" }),
  ).toBeDisabled();
  await expect(page.locator(".console-stat").first()).toContainText(
    "67 sospesi",
  );
  await page
    .getByRole("button", { name: "Riprendi sistema", exact: true })
    .click();
  await expect(page.locator(".console-stat").first()).toContainText("66");
  await expect(
    page.getByRole("button", { name: "Abilita RIC-01", exact: true }),
  ).toBeVisible();
});

test("editor saves task, instructions and priority, runs once and records approval", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "Gestisci MES-01", exact: true })
    .click();
  await page
    .getByLabel("Incarico corrente")
    .fill("Prepara una bozza per un’azienda fittizia.");
  await page
    .getByLabel("Istruzioni operative")
    .fill("Usa solo dati di esempio. Non inviare nulla.");
  await page.getByLabel("Priorità", { exact: true }).selectOption("Alta");
  await page.getByRole("button", { name: "Salva configurazione" }).click();
  await page
    .getByRole("button", { name: "Gestisci MES-01", exact: true })
    .click();
  await expect(page.getByLabel("Incarico corrente")).toHaveValue(
    "Prepara una bozza per un’azienda fittizia.",
  );
  await page.getByRole("button", { name: "Esegui incarico salvato" }).click();
  await expect(page.getByRole("dialog")).toContainText("ESITO SIMULATO");
  await expect(page.getByRole("dialog")).toContainText("Da approvare");
  await page.getByRole("button", { name: "Approva esito demo" }).click();
  await expect(page.getByRole("dialog")).toContainText("1 completamenti");
  await page.getByRole("button", { name: "Chiudi", exact: true }).click();
  await page.locator('[data-console-view="Registro attività"]').click();
  await expect(page.locator(".console-audit")).toContainText(
    "Esito demo approvato manualmente",
  );
  await page.reload();
  await navigate(page);
  await page
    .getByRole("button", { name: "Gestisci MES-01", exact: true })
    .click();
  await expect(page.getByLabel("Priorità", { exact: true })).toHaveValue(
    "Alta",
  );
  await expect(page.getByRole("dialog")).toContainText("1 completamenti");
});

test("rejecting a review reopens the saved task", async ({ page }) => {
  await page
    .getByRole("button", { name: "Gestisci AGE-01", exact: true })
    .click();
  await page.getByRole("button", { name: "Esegui incarico salvato" }).click();
  await page
    .getByRole("button", { name: "Rimetti in coda", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("In coda");
  await expect(page.getByRole("dialog")).toContainText("0 completamenti");
  await expect(
    page.getByRole("button", { name: "Esegui incarico salvato" }),
  ).toBeEnabled();
});

test("exported detailed report and audit contain current operations, not commercial claims", async ({
  page,
}) => {
  await page.getByLabel("Seleziona RIC-01", { exact: true }).check();
  await page.getByRole("button", { name: "Esegui su 1 selezionati" }).click();
  await page.locator('[data-console-view="Report operativo"]').click();
  const reportPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Scarica report .md", exact: true })
    .click();
  const report = await reportPromise;
  expect(report.suggestedFilename()).toBe("agente-report-dettagliato.md");
  const content = await fs.readFile(await report.path(), "utf8");
  expect(content).toContain(
    "Esecuzioni demo cumulative: 1; completamenti cumulativi: 1",
  );
  expect(content).toContain("Email reali inviate: 0");
  expect(content).toContain("MES-15");
  await page.locator('[data-console-view="Registro attività"]').click();
  const auditPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Esporta registro", exact: true })
    .click();
  const audit = JSON.parse(
    await fs.readFile(await (await auditPromise).path(), "utf8"),
  );
  expect(audit.mode).toBe("demo");
  expect(audit.events[0].agentId).toBe("RIC-01");
});

test("console is navigable on mobile without document overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByLabel("Cerca agenti", { exact: true }).fill("RIC-01");
  await page
    .getByRole("button", { name: "Gestisci RIC-01", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.locator('[data-console-view="Report operativo"]').click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("legacy storage migrates to the complete agent catalog", async ({
  page,
}) => {
  await page.evaluate(() =>
    localStorage.setItem(
      "agente-v1",
      JSON.stringify({
        running: false,
        campaign: {
          name: "Campagna precedente",
          sector: "Design",
          city: "Milano",
          limit: 20,
        },
      }),
    ),
  );
  await page.reload();
  await navigate(page);
  await expect(page.locator("#agent-rows tr")).toHaveCount(67);
  await expect(
    page.getByRole("button", { name: "Riprendi sistema" }),
  ).toBeVisible();
});
