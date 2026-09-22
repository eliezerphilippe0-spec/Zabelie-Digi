import { test, expect } from "@playwright/test";

test("seller signup links open account creation and retain the return destination", async ({ page }) => {
  await page.goto("/connexion?mode=signup&next=/vendre");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Inscription");
  await expect(page.locator('#auth-name')).toBeVisible();
  expect(new URL(page.url()).searchParams.get("next")).toBe("/vendre");
});

test("ordinary and unknown auth modes keep the sign-in form", async ({ page }) => {
  for (const url of ["/connexion?next=/vendre", "/connexion?mode=unknown&next=/vendre"]) {
    await page.goto(url);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Connexion");
    await expect(page.locator('#auth-name')).toHaveCount(0);
  }
});
