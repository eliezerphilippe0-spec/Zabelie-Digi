import { test, expect } from "@playwright/test";
import { PRODUCTS } from "../lib/sample-data";
import { KIND_FILE, KIND_SERVICE } from "../lib/product-kind";

for (const [universe, kind, title] of [
  ["numerique", KIND_FILE, "Produits digitaux"],
  ["services", KIND_SERVICE, "Services"],
] as const) {
  test(`le catalogue ${universe} ne présente que ses offres`, async ({ page }) => {
    await page.goto(`/catalogue?univers=${universe}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
    const main = page.locator("main");
    for (const product of PRODUCTS) {
      const card = main.locator(`a[href="/produit/${product.slug}"]`);
      if (product.kind === kind) await expect(card.first()).toBeVisible();
      else await expect(card).toHaveCount(0);
    }
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", new RegExp(`univers=${universe}$`));
  });
}

test("la recherche GET conserve l'univers digital", async ({ browser, baseURL }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${baseURL}/catalogue?univers=numerique`);
  const form = page.locator('main form[action="/catalogue"]').first();
  await form.locator('input[name="q"]').fill("Lightroom");
  await Promise.all([page.waitForURL(/q=Lightroom/), form.locator('button[type="submit"]').click()]);
  expect(new URL(page.url()).searchParams.get("univers")).toBe("numerique");
  await expect(page.locator('main a[href="/produit/pack-presets-lightroom-afro"]').first()).toBeVisible();
  await context.close();
});

test("un rayon vide reste accessible et les recharges suspendues sont expliquées", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/catalogue?univers=objets");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Produits physiques");
  await expect(page.locator('header a[href="/catalogue?univers=numerique"]').first()).toBeAttached();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.goto("/rechaj");
  await expect(page).toHaveURL(/\/recharges$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Recharges et paiements");
  await expect(page.locator('main a[href="/rechaj"]')).toHaveCount(0);
  await expect(page.locator("main")).toContainText("MonCash");
  await expect(page.locator("main")).toContainText("NatCash");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
