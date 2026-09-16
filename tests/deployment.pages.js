import { test, expect } from "@playwright/test";

test("Pages bundle loads scripts and styles under /Agente/ and opens console directly", async ({
  page,
}) => {
  const errors = [];
  const failures = [];
  const assets = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => {
    if (response.url().includes("/Agente/assets/")) {
      assets.push(response.url());
      if (!response.ok()) failures.push(response.url());
    }
  });
  await page.goto("./#gestione-agenti");
  await expect(page.locator("h1")).toContainText(
    "67 agenti. Il controllo è tuo",
  );
  await expect(page.locator("#agent-rows tr")).toHaveCount(67);
  await page
    .getByRole("button", { name: "Gestisci RIC-01", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Esegui incarico salvato", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("ESITO SIMULATO");
  await expect(page.getByRole("dialog")).toContainText("Completato");
  expect(assets.some((url) => url.endsWith(".js"))).toBe(true);
  expect(assets.some((url) => url.endsWith(".css"))).toBe(true);
  expect(errors).toEqual([]);
  expect(failures).toEqual([]);
});

test("Pages direct console link works on mobile and the authored report is served", async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./#gestione-agenti");
  await expect(page.getByLabel("Cerca agenti", { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const report = await request.get("./REPORT_DETTAGLIATO.md");
  expect(report.ok()).toBe(true);
  expect(await report.text()).toContain("Report dettagliato di consegna");
});
