import { defineConfig, devices } from "@playwright/test";
import { join } from "node:path";
import { tmpdir } from "node:os";

/**
 * Studio de création éditoriale (docs/70) — parcours de bout en bout contre
 * un faux Supabase isolé (`e2e/fixtures/stub-creation.mjs`). Le Studio est
 * ALLUMÉ pour ce seul serveur ; la suite e2e principale le garde éteint.
 */
const stub = "http://127.0.0.1:15431";
const port = process.env.CREATION_APP_PORT || "3011";
const app = "http://127.0.0.1:" + port;
const reuse = process.env.CREATION_REUSE === "true";

export default defineConfig({
  testDir: "./e2e-creation",
  workers: 1,
  retries: 0,
  reporter: "list",
  outputDir: join(tmpdir(), "zabelie-creation-results"),
  use: {
    ...devices["Desktop Chrome"],
    baseURL: app,
    trace: "retain-on-failure",
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : undefined,
  },
  webServer: [
    { command: "node e2e/fixtures/stub-creation.mjs", url: stub + "/__health", reuseExistingServer: reuse, env: { STUB_PORT: "15431", APP_PORT: port } },
    {
      command: "npm run start",
      url: app,
      reuseExistingServer: reuse,
      timeout: 120000,
      env: {
        NEXT_PUBLIC_SUPABASE_URL: stub,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "cle-anon-de-test",
        SUPABASE_SERVICE_ROLE_KEY: "cle-service-de-test",
        PORT: port,
        ZABELIE_AUTHORING_ENABLED: "true",
      },
    },
  ],
});
