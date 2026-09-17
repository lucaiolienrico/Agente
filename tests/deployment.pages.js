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

test("Pages repository root redirects to the compiled console with working relative assets", async ({
  page,
}) => {
  const { createServer } = await import("node:http");
  const { readFile } = await import("node:fs/promises");
  const { resolve, extname } = await import("node:path");
  const root = resolve("docs");
  const failures = [];
  page.on("pageerror", (error) => failures.push(error.message));
  const server = createServer(async (req, res) => {
    const pathname = new URL(req.url, "http://localhost").pathname;
    let file;
    if (pathname === "/Agente/") file = resolve("index.html");
    else if (pathname.startsWith("/Agente/docs/")) {
      file = resolve(
        root,
        pathname.slice("/Agente/docs/".length) || "index.html",
      );
      if (!file.startsWith(root + "/")) file = null;
    }
    if (!file) {
      res.writeHead(404).end();
      return;
    }
    try {
      const body = await readFile(file);
      const type =
        { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" }[
          extname(file)
        ] || "text/plain";
      res.writeHead(200, { "Content-Type": type });
      res.end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    await page.goto(`http://127.0.0.1:${server.address().port}/Agente/`);
    await expect(page).toHaveURL(/\/Agente\/docs\/#gestione-agenti$/);
    await expect(page.locator("#agent-rows tr")).toHaveCount(67);
    await expect(page.locator("h1")).toContainText("Il controllo è tuo");
    expect(failures).toEqual([]);
    expect(await readFile("docs/index.html", "utf8")).not.toContain(
      'name="pages-root-redirect"',
    );
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
