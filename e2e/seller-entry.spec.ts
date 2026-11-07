import { test, expect } from "@playwright/test";
import { t } from "../lib/i18n";

// Titre de la carte depuis le chantier design, Phase 4 (V-28) : il dit où l on est
// (« Créez votre compte Zabelie »), l onglet garde « Inscription ».

test("seller signup links open account creation and retain the return destination", async ({ page }) => {
  await page.goto("/connexion?mode=signup&next=/vendre");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(t("fr", "auth.title.signup"));
  await expect(page.locator('#auth-name')).toBeVisible();
  expect(new URL(page.url()).searchParams.get("next")).toBe("/vendre");
});

test("ordinary and unknown auth modes keep the sign-in form", async ({ page }) => {
  for (const url of ["/connexion?next=/vendre", "/connexion?mode=unknown&next=/vendre"]) {
    await page.goto(url);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(t("fr", "auth.title.signin"));
    await expect(page.locator('#auth-name')).toHaveCount(0);
  }
});
