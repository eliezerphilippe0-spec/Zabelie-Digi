import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: /topup-sandbox/,
  outputDir: process.env.PW_TOPUP_OUTPUT_DIR || "test-results/topup",
  reporter: "list",
  use: { ...devices["Desktop Chrome"], baseURL: "http://127.0.0.1:3004",
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : undefined },
  webServer: {
    command: "npm run start",
    url: "http://127.0.0.1:3004",
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      PORT: "3004", RELOADLY_MODE: "sandbox",
      RELOADLY_CLIENT_ID: "fixture-client", RELOADLY_CLIENT_SECRET: "fixture-secret",
      ZABELIE_TOPUP_FIRSTPARTY_ENABLED: "true",
      NEXT_PUBLIC_SUPABASE_URL: "", NEXT_PUBLIC_SUPABASE_ANON_KEY: "", SUPABASE_SERVICE_ROLE_KEY: "",
    },
  },
});
