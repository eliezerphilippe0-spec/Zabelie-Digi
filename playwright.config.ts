import { defineConfig, devices } from "@playwright/test";

/**
 * Tests E2E ciblés sur le CHEMIN DE L'ARGENT (checkout, redirection MonCash,
 * pages de résultat) et sur le PARCOURS PRODUIT PHYSIQUE. Pas de couverture UI
 * exhaustive — uniquement ce qui te coûterait cher si ça cassait.
 *
 * Deux environnements, parce qu'ils ne peuvent pas cohabiter :
 *   - `chromium` (port 3000) : mode démo, sans Supabase. Les appels backend
 *     sont interceptés par Playwright.
 *   - `physique` (port 3001) : adossé à `e2e/fixtures/stub-supabase.mjs`. Le
 *     mode démo n'a pas de base, donc aucun produit `physical` — or c'est
 *     exactement ce qu'il faut faire traverser le flux.
 *
 * En local, un Chromium complet peut vivre ailleurs que le « headless shell »
 * attendu : `PW_CHROMIUM_PATH=/chemin/vers/chromium npm run test:e2e`.
 */
const executablePath = process.env.PW_CHROMIUM_PATH;
const launchOptions = executablePath ? { executablePath } : undefined;

const STUB_URL = "http://127.0.0.1:54321";
const STUB_ENV = {
  NEXT_PUBLIC_SUPABASE_URL: STUB_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "cle-anon-de-test",
  SUPABASE_SERVICE_ROLE_KEY: "cle-service-de-test",
  PORT: "3001",
};

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: { trace: "on-first-retry", launchOptions },
  webServer: [
    {
      command: "npm run start",
      url: "http://localhost:3000",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: "node e2e/fixtures/stub-supabase.mjs",
      url: `${STUB_URL}/__sante`,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
    {
      command: "npm run start",
      url: "http://127.0.0.1:3001",
      env: STUB_ENV,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
  projects: [
    {
      name: "chromium",
      testIgnore: /parcours-physique/,
      use: { ...devices["Desktop Chrome"], baseURL: "http://localhost:3000" },
    },
    {
      name: "physique",
      testMatch: /parcours-physique/,
      use: { ...devices["Desktop Chrome"], baseURL: "http://127.0.0.1:3001" },
    },
  ],
});
