import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("dashboard opens without errors and lists all 67 roles", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.reload();
  await expect(page.locator(".department-card")).toHaveCount(8);
  let count = 0;
  for (let i = 0; i < 8; i++) {
    await page.locator(`[data-department="${i}"]`).click();
    count += await page.locator(".agent-row").count();
    await page.getByRole("button", { name: "Chiudi", exact: true }).click();
  }
  expect(count).toBe(67);
  expect(errors).toEqual([]);
});

test("pause persists and blocks simulation, resume qualifies a lead", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "Metti in pausa", exact: true })
    .click();
  await page.reload();
  await expect(page.locator(".live-label")).toContainText("67 agenti in pausa");
  await page.getByRole("button", { name: "Esegui un ciclo demo" }).click();
  await expect(page.locator("#toast")).toContainText("Riprendi gli agenti");
  await page.getByRole("button", { name: "Riprendi", exact: true }).click();
  await page.getByRole("button", { name: "Esegui un ciclo demo" }).click();
  await expect(page.locator(".activity-list")).toContainText(
    "Alba Consulting è qualificata",
  );
});

test("campaign form saves preferences across reload", async ({ page }) => {
  await page.getByRole("button", { name: "Nuova campagna" }).click();
  await page.getByLabel("Nome campagna").fill("Clienti Lombardia");
  await page.getByLabel("Settore ideale").fill("Design");
  await page.getByLabel("Area geografica").fill("Milano");
  await page.getByRole("button", { name: "Crea campagna demo" }).click();
  await page.reload();
  await page.locator('.sidebar [data-page="Impostazioni"]').first().click();
  await expect(page.getByLabel("Nome campagna")).toHaveValue(
    "Clienti Lombardia",
  );
  await expect(page.getByLabel("Settore ideale")).toHaveValue("Design");
});

test("pipeline combines filters, empty states and persistent lead edits", async ({
  page,
}) => {
  await page.locator('.sidebar [data-page="Clienti potenziali"]').click();
  await page.getByLabel("Cerca contatti").fill("Nexora");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await page.getByLabel("Filtra per stato").selectOption("Qualificato");
  await expect(page.getByText("Nessun contatto trovato")).toBeVisible();
  await page.getByLabel("Filtra per stato").selectOption("Tutti");
  await page.getByRole("button", { name: "Apri Nexora Digital" }).click();
  await page.getByLabel("Stato nella pipeline").selectOption("Appuntamento");
  await page.getByRole("button", { name: "Salva stato" }).click();
  await expect(page.locator("tbody .status-badge")).toHaveText("Appuntamento");
  await page.reload();
  await page.locator('.sidebar [data-page="Clienti potenziali"]').click();
  await page.getByLabel("Cerca contatti").fill("Nexora");
  await expect(page.locator("tbody .status-badge")).toHaveText("Appuntamento");
});

test("agenda navigates to next meeting and opens the contact", async ({
  page,
}) => {
  await page.locator('.sidebar [data-page="Agenda"]').click();
  await page.getByRole("button", { name: "Vai al prossimo incontro" }).click();
  await expect(page.locator(".meeting")).toHaveCount(2);
  await page
    .getByRole("button", { name: "Prepara la chiamata" })
    .first()
    .click();
  await expect(page.getByRole("dialog")).toContainText("Giulia Moretti");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("exports produce downloadable CSV and ten-line report", async ({
  page,
}) => {
  await page.locator('.sidebar [data-page="Clienti potenziali"]').click();
  const csvPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Esporta contatti" }).click();
  expect((await csvPromise).suggestedFilename()).toBe(
    "agente-contatti-demo.csv",
  );
  await page.locator('.sidebar [data-page="Report & insight"]').click();
  await expect(page.locator(".report-lines li")).toHaveCount(10);
  const reportPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Scarica report" }).click();
  expect((await reportPromise).suggestedFilename()).toBe(
    "agente-report-demo.txt",
  );
});

test("mobile has no page overflow and menu navigates", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("button", { name: "Apri menu" })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Apri menu" }).click();
  await page.locator('.sidebar [data-page="Clienti potenziali"]').click();
  await expect(
    page.getByRole("heading", { name: "Le relazioni iniziano qui." }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
