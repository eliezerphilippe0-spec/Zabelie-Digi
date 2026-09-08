import { test, expect } from "@playwright/test";

for (const width of [390, 1440]) {
  test(`les catégories et leurs trois niveaux sont accessibles à ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/categories");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Toutes les catégories");
    await expect(page.locator("main")).toContainText("Aucune offre publiée");
    await page.locator("main summary").filter({ hasText: "Vêtements femme" }).click();
    await expect(page.locator("main").getByRole("link", { name: "Robes", exact: true })).toHaveAttribute("href", "/catalogue?cat=Mode%20%26%20accessoires&sous=wob");
    await expect(page.locator("main")).not.toContainText("Rayon fermé");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const form = page.locator("main form");
    await form.locator('input[name="q"]').fill("echarpes");
    await form.getByRole("button").click();
    await expect(page.locator("main").getByRole("link", { name: "Écharpes", exact: true })).toBeVisible();
    await expect(page.locator("main").getByRole("link", { name: "Robes", exact: true })).toHaveCount(0);
    await expect(page.locator("main")).toContainText("Mode & accessoires");
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/categories$/);
  });
}

test("une recherche de catégorie répétée ou inconnue ne casse pas la page", async ({ page }) => {
  await page.goto("/categories?q=robes&q=autre");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Toutes les catégories");
  await page.goto("/categories?q=introuvable-xyz");
  await expect(page.locator("main")).toContainText("Aucune catégorie ne correspond");
  await page.locator("main").getByRole("link", { name: "Afficher toutes les catégories" }).click();
  await expect(page.locator("main")).toContainText("Vêtements femme");
});
