import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e", workers: 1, reporter: "list",
  use: { ...devices["Desktop Chrome"], launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : undefined },
  webServer: [
    { command: "node node_modules/next/dist/bin/next start -p 3016", url: "http://localhost:3016", env: { ZABELIE_DEMO_FIXTURES: "true" }, reuseExistingServer: false, timeout: 120000 },
    { command: "node e2e/fixtures/stub-supabase.mjs", url: "http://127.0.0.1:54321/__sante", reuseExistingServer: false },
    { command: "node node_modules/next/dist/bin/next start -p 3017", url: "http://127.0.0.1:3017", env: { NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321", NEXT_PUBLIC_SUPABASE_ANON_KEY: "cle-anon-de-test", SUPABASE_SERVICE_ROLE_KEY: "cle-service-de-test" }, reuseExistingServer: false, timeout: 120000 },
  ],
  projects: [
    { name: "offline", testMatch: /marketplace-offline\.spec/, use: { baseURL: "http://localhost:3016" } },
    { name: "confidence", testMatch: /parcours-physique-marketplace-confiance\.spec/, use: { baseURL: "http://127.0.0.1:3017" } },
  ],
});
