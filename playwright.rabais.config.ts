import { defineConfig, devices } from "@playwright/test";
import { join } from "node:path";
import { tmpdir } from "node:os";

const stub = "http://127.0.0.1:54327";
export default defineConfig({
  testDir: "./e2e-rabais", workers: 1, retries: 0, reporter: "list",
  outputDir: join(tmpdir(), "zabelie-rabais-results"),
  use: {
    ...devices["Desktop Chrome"], baseURL: "http://127.0.0.1:3007",
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : undefined,
    trace: "retain-on-failure",
  },
  webServer: [
    { command: "node e2e/fixtures/stub-supabase.mjs", url: stub + "/__sante", reuseExistingServer: false,
      env: { STUB_PORT: "54327", DISCOUNT_FIXTURE: "true" } },
    { command: "npm run start", url: "http://127.0.0.1:3007", reuseExistingServer: false, timeout: 120000,
      env: { NEXT_PUBLIC_SUPABASE_URL: stub, NEXT_PUBLIC_SUPABASE_ANON_KEY: "cle-anon-de-test",
        SUPABASE_SERVICE_ROLE_KEY: "cle-service-de-test", PORT: "3007", MONCASH_MODE: "sandbox", MONCASH_CLIENT_ID: "", MONCASH_CLIENT_SECRET: "" } },
  ],
});
