import { test, expect } from "@playwright/test";
import { t } from "../lib/i18n";
import { CONDITIONS_VERSION, CONFIDENTIALITE_VERSION } from "../lib/legal-acceptance";

for (const lang of ["fr", "ht", "en", "es"] as const) {
  test(`inscription explicite et documents publics à 360 px : ${lang}`, async ({ page, context }) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.setViewportSize({ width: 360, height: 800 });
    await context.addCookies([{ name: "zabelie_lang", value: lang, url: "http://localhost:3000" }]);
    await page.goto("/connexion?mode=signup&next=%2Fpanier");
    await expect(page.getByRole("heading", { level: 1, name: t(lang, "auth.tab.signup") })).toBeVisible();
    const terms = page.getByRole("checkbox", { name: t(lang, "auth.legal.conditions.accept"), exact: true });
    const privacy = page.getByRole("checkbox", { name: t(lang, "auth.legal.privacy.read"), exact: true });
    const submit = page.getByRole("button", { name: t(lang, "auth.signup.cta"), exact: true });
    await expect(terms).not.toBeChecked();
    await expect(privacy).not.toBeChecked();
    await expect(submit).toBeDisabled();
    await terms.check();
    await expect(submit).toBeDisabled();
    for (const [key, version] of [["auth.legal.conditions.link", CONDITIONS_VERSION], ["auth.legal.privacy.link", CONFIDENTIALITE_VERSION]] as const) {
      const link = page.getByRole("link", { name: t(lang, key), exact: true });
      const popupPromise = page.waitForEvent("popup");
      await link.click();
      const popup = await popupPromise;
      await expect(popup.locator("main")).toHaveAttribute("data-policy-version", version);
      await expect(popup.locator("h1")).toBeVisible();
      expect(await popup.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await popup.close();
    }
    await privacy.check();
    await expect(submit).toBeEnabled();
    await privacy.uncheck();
    await expect(submit).toBeDisabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}

test("première session OAuth présente les deux actes ; retour connexion conserve les champs habituels", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/connexion?mode=legal&next=%2Fpanier");
  await expect(page.getByRole("heading", { level: 1, name: t("fr", "auth.legal.title") })).toBeVisible();
  await expect(page.locator("#auth-email")).toHaveCount(0);
  await expect(page.locator("#auth-conditions")).not.toBeChecked();
  await expect(page.locator("#auth-privacy")).not.toBeChecked();
  await expect(page.getByRole("button", { name: t("fr", "auth.legal.continue"), exact: true })).toBeDisabled();
  await page.getByRole("link", { name: t("fr", "auth.tab.signin"), exact: true }).click();
  await expect(page.locator("#auth-email")).toBeVisible();
  await expect(page.locator("#auth-password")).toBeVisible();
  await expect(page.locator("#auth-conditions")).toHaveCount(0);
});
