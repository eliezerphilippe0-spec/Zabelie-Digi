import { defineConfig, devices } from "@playwright/test";
const stub = "http://127.0.0.1:54325";
export default defineConfig({
  testDir: "./e2e-pricing", workers: 1, retries: 0, reporter: "list",
  use: {
    ...devices["Desktop Chrome"], baseURL: "http://127.0.0.1:3005",
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : undefined,
    trace: "retain-on-failure",
  },
  webServer: [
    { command: "node e2e/fixtures/stub-supabase.mjs", url: stub + "/__sante", reuseExistingServer: false,
      env: { STUB_PORT: "54325", PRICING_FIXTURE: "true" } },
    { command: "npm run start", url: "http://127.0.0.1:3005", reuseExistingServer: false, timeout: 120000,
      env: { NEXT_PUBLIC_SUPABASE_URL: stub, NEXT_PUBLIC_SUPABASE_ANON_KEY: "cle-anon-de-test",
        SUPABASE_SERVICE_ROLE_KEY: "cle-service-de-test", PORT: "3005", MONCASH_MODE: "sandbox" } },
  ],
});
