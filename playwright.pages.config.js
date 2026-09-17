import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.pages.js",
  workers: 1,
  use: {
    baseURL: "http://localhost:4173/Agente/",
    headless: true,
    launchOptions: process.env.CHROMIUM_PATH
      ? {
          executablePath: process.env.CHROMIUM_PATH,
          args: ["--no-sandbox", "--disable-dev-shm-usage"],
        }
      : {},
  },
  webServer: {
    command: "npm run preview -- --outDir docs --base /Agente/ --port 4173",
    url: "http://localhost:4173/Agente/",
    reuseExistingServer: !process.env.CI,
  },
});
