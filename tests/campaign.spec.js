import { test, expect } from "@playwright/test";

test("new console displays the nationwide pet target and inherits it in agent executions", async ({
  page,
}) => {
  await page.goto("/#gestione-agenti");
  await expect(page.locator(".target-profile h2")).toHaveText(
    "Veterinari, pet shop e negozi di animali",
  );
  await page.locator(".target-profile summary").click();
  await expect(page.locator(".target-profile")).toContainText("tutta Italia");
  await expect(page.locator(".target-profile")).toContainText(
    "Offerta: da definire",
  );
  await page
    .getByRole("button", { name: "Gestisci RIC-01", exact: true })
    .click();
  await expect(page.locator(".agent-target-context")).toContainText(
    "Veterinari, pet shop e negozi di animali",
  );
  await page.getByRole("button", { name: "Esegui incarico salvato" }).click();
  await expect(page.locator(".agent-workflow pre")).toContainText(
    "Territorio: Italia",
  );
});

test("legacy campaign migrates without deleting contacts or resuming the global pause", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(() =>
    localStorage.setItem(
      "agente-v1",
      JSON.stringify({
        running: false,
        leads: [],
        campaign: {
          name: "Nuovi clienti · Italia",
          sector: "Servizi B2B",
          city: "Italia",
          limit: 25,
        },
      }),
    ),
  );
  await page.reload();
  await page.locator('.sidebar [data-page="Impostazioni"]').first().click();
  await expect(page.getByLabel("Settore ideale")).toHaveValue(
    "Veterinari, pet shop e negozi di animali",
  );
  await expect(page.getByLabel("Limite giornaliero di invio")).toHaveValue(
    "25",
  );
  await page.getByRole("button", { name: "Salva preferenze" }).click();
  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("agente-v1")),
  );
  expect(stored.leads).toEqual([]);
  expect(stored.running).toBe(false);
});

test("no commercial offer is invented and the general sample is disclosed", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator('.sidebar [data-page="Clienti potenziali"]').click();
  await expect(page.locator(".sample-notice")).toContainText(
    "non sono risultati della campagna attuale",
  );
  await page.getByRole("button", { name: "Apri Studio Forma" }).click();
  await expect(
    page.getByRole("button", { name: "Copia bozza" }),
  ).toBeDisabled();
  await expect(page.locator(".message-preview")).toContainText(
    "Non conosciamo ancora la tua proposta commerciale",
  );
  await page.getByRole("button", { name: "Chiudi", exact: true }).click();
  await page.locator('.sidebar [data-page="Impostazioni"]').first().click();
  await page
    .getByLabel("Prodotto o servizio offerto")
    .fill("Offerta dimostrativa per professionisti del settore pet.");
  await page.getByRole("button", { name: "Salva preferenze" }).click();
  await page.reload();
  await page.locator('.sidebar [data-page="Clienti potenziali"]').click();
  await page.getByRole("button", { name: "Apri Studio Forma" }).click();
  await expect(page.getByRole("button", { name: "Copia bozza" })).toBeEnabled();
  await expect(page.locator(".message-preview")).toContainText(
    "Offerta dimostrativa per professionisti del settore pet.",
  );
});
