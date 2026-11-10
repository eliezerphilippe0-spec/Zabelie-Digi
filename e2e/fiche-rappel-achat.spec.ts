import { test, expect } from "@playwright/test";
import { PRODUCTS } from "../lib/sample-data";

/**
 * LE RAPPEL D'ACHAT DE LA FICHE, dans un navigateur (audit 2026-11-10, P0-6).
 *
 * Avant : à 360 × 800, le bouton de paiement était à plus d'un écran de
 * défilement et rien ne le rappelait. Ce test tient ce que la barre promet :
 * visible au chargement, posée sur la barre de navigation sans la recouvrir,
 * un lien qui mène au bloc d'achat, et jamais à l'écran en même temps que le
 * bouton de paiement ou qu'un autre bouton principal.
 *
 * Éprouvé dans l'autre sens le 2026-11-10 : avec `setVisible(true)` forcé dans
 * le composant, ce test rougit (barre et bouton de paiement visibles ensemble).
 */
const produit = PRODUCTS.find((p) => p.priceHTG > 0)!;

test("à 360 px : visible au chargement, mène au bloc d'achat, s'efface devant lui", async ({ page, context, baseURL }) => {
  await context.addCookies([{ name: "zabelie_lang", value: "ht", url: baseURL! }]);
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto(`/produit/${produit.slug}`, { waitUntil: "networkidle" });

  const barre = page.locator("[data-rappel-achat]");
  const payer = page.locator("#acheter").getByRole("button", { name: /MonCash/ });
  await expect(barre).toBeVisible();
  await expect(payer).not.toBeInViewport();

  // Posée SUR la barre de navigation : ni recouvrement, ni trou.
  const [b, n] = await Promise.all([barre.boundingBox(), page.locator("nav.barre-nav").boundingBox()]);
  expect(Math.abs(b!.y + b!.height - n!.y)).toBeLessThanOrEqual(1);
  expect(b!.height).toBeLessThanOrEqual(64);

  // Le prix de la barre est celui de la zone de prix.
  const prixFiche = (await page.locator("[data-zone-prix] .prix").first().innerText()).replace(/\s+/g, " ").trim();
  expect((await barre.locator(".prix").innerText()).replace(/\s+/g, " ").trim()).toBe(prixFiche);

  const lien = barre.getByRole("link");
  await expect(lien).toHaveAttribute("href", "#acheter");
  expect((await lien.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await lien.click();
  await expect(payer).toBeInViewport();
  await expect(barre).toHaveCount(0);

  // À aucune position de défilement la barre ne côtoie une autre action principale.
  const hauteur = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < hauteur; y += 200) {
    await page.evaluate((v) => scrollTo(0, v), y);
    await page.waitForTimeout(120);
    const etat = await page.evaluate(() => {
      const dansVue = (e: Element) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.bottom > 0 && r.top < innerHeight; };
      return {
        barre: Boolean(document.querySelector("[data-rappel-achat]")),
        autres: [...document.querySelectorAll("#acheter, main .bouton-primaire")].filter((e) => !e.closest("[data-rappel-achat]")).filter(dansVue).length,
      };
    });
    expect(etat.barre && etat.autres > 0, `à y = ${y}, la barre côtoie ${etat.autres} autre(s) action(s)`).toBe(false);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("à 1 280 px, aucun rappel : le bloc d'achat est déjà là", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/produit/${produit.slug}`, { waitUntil: "networkidle" });
  await expect(page.locator("[data-rappel-achat]:visible")).toHaveCount(0);
});
