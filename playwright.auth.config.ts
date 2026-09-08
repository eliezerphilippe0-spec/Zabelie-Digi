import { defineConfig, devices } from "@playwright/test";

// Job isolé : les NEXT_PUBLIC_* sont impérativement posées AU BUILD.
export default defineConfig({
  testDir: "./e2e-auth",
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: { ...devices["Desktop Chrome"], baseURL: "http://127.0.0.1:3003", trace: "retain-on-failure", launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : undefined },
  webServer: [
    { command: "node e2e-auth/stub-auth.mjs", url: "http://127.0.0.1:54323/__health", reuseExistingServer: false },
    { command: "npm run start", url: "http://127.0.0.1:3003", reuseExistingServer: false, timeout: 120000,
      env: { PORT:"3003", NEXT_PUBLIC_SUPABASE_URL:"http://127.0.0.1:54323", NEXT_PUBLIC_SUPABASE_ANON_KEY:"cle-anon-de-test", SUPABASE_SERVICE_ROLE_KEY:"cle-service-de-test" } },
  ],
});
