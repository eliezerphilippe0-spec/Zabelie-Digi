import { test, expect } from "@playwright/test";

/**
 * Le stub (FLASH_FIXTURE) sert une offre vivante : « Filtre à huile Corolla »
 * à 1 050 HTG au lieu de 1 500 (−30 %), plafond 10, 3 déjà prises.
 */

for (const width of [360, 1280]) {
  test(`accueil : la rangée Ventes flash montre remise, prix, stock et compte à rebours à ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const erreurs: string[] = [];
    page.on("pageerror", (e) => erreurs.push(e.message));
    await page.goto("/");
    const rangee = page.getByRole("region", { name: "Ventes flash" });
    await expect(rangee).toBeVisible();
    await expect(rangee.getByText("−30%")).toBeVisible();
    await expect(rangee.getByText("1 050 HTG")).toBeVisible();
    await expect(rangee.getByText("Plus que 7 au prix flash")).toBeVisible();
    await expect(rangee.getByText(/Se termine dans \d+:\d\d:\d\d/)).toBeVisible();
    // La carte n'ajoute pas un second titre au produit : la rangée principale garde le sien.
    await expect(page.getByRole("heading", { name: "Filtre à huile Corolla" })).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    // La barre est remplie à la part réellement prise (3 sur 10).
    const part = await rangee.locator(".flash-barre > span").evaluate((el) => getComputedStyle(el).getPropertyValue("--part").trim());
    expect(Number(part)).toBeCloseTo(0.3, 2);
    expect(erreurs).toEqual([]);
  });
}

test("fiche produit : badge, remise et barre de stock flash", async ({ page }) => {
  await page.goto("/produit/filtre-huile-corolla");
  const achat = page.locator("#acheter");
  await expect(achat.getByText("Vente flash")).toBeVisible();
  await expect(achat.getByText("−30%")).toBeVisible();
  await expect(achat.getByText("Plus que 7 au prix flash")).toBeVisible();
});

test("mouvement réduit : aucune animation, tout est déjà à sa place", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const rangee = page.getByRole("region", { name: "Ventes flash" });
  for (const sel of [".flash-eclair", ".flash-remise", ".flash-barre > span"]) {
    expect(await rangee.locator(sel).first().evaluate((el) => getComputedStyle(el).animationName), sel).toBe("none");
  }
});
