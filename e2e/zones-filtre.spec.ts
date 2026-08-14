import { test, expect } from "@playwright/test";

/**
 * Filtre par zone (PR-Z3) — contre le serveur DÉMO (`ZABELIE_DEMO_FIXTURES`).
 *
 * Les fixtures n'ont PAS de zone, et c'est la propriété testée ici : sous un
 * filtre zone, la démo doit rendre ZÉRO résultat — jamais le catalogue
 * entier sous un filtre qui n'a pas pris (la règle `productIds`/`zoneId` de
 * `lib/products.ts`). Le parcours nominal avec vraies zones se prouve dans
 * la suite SQL (Z1→Z6) et se verra en production.
 */

test.describe("Catalogue — filtre zone (démo)", () => {
  test("sans filtre, le catalogue démo montre ses produits", async ({ page }) => {
    await page.goto("/catalogue");
    await expect(
      page.getByRole("link", { name: /Mentorat design produit/i })
    ).toBeVisible();
  });

  test("sous un filtre zone, la démo rend zéro résultat — pas le catalogue entier", async ({
    page,
  }) => {
    await page.goto("/catalogue?zd=00000000-0000-0000-0000-000000000001");
    // Le produit-témoin, visible sans filtre, doit avoir DISPARU : c'est la
    // preuve que le filtre a pris. Un catalogue identique sous filtre serait
    // exactement le défaut « filtre qui se défait en silence ».
    await expect(
      page.getByRole("link", { name: /Mentorat design produit/i })
    ).toHaveCount(0);
  });

  test("le sélecteur de zone est absent en démo — pas de filtre décoratif", async ({
    page,
  }) => {
    await page.goto("/catalogue");
    // La table des zones est vide en démo : un sélecteur à une seule option
    // (« Toute Haïti ») ne serait pas un filtre, ce serait du décor — même
    // règle que les puces catégories.
    await expect(page.locator('select[name="zd"]')).toHaveCount(0);
  });
});
