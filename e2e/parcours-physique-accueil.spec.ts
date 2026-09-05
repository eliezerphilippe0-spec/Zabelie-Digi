import { test, expect } from "@playwright/test";

// La base simulée du projet physique contient une seule offre publiée.
for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 1000 }]) {
  test(`accueil : une offre réelle reste visible à ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Découvrez les offres des vendeurs haïtiens" })).toBeVisible();
    const product = page.getByRole("heading", { name: "Filtre à huile Corolla" });
    await expect(product).toBeVisible();
    await expect(page.getByText("Zabelie met en relation", { exact: false })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await product.click();
    await expect(page).toHaveURL(/\/produit\/filtre-huile-corolla$/);
    await expect(page.getByRole("heading", { level: 1, name: "Filtre à huile Corolla" })).toBeVisible();
  });
}
