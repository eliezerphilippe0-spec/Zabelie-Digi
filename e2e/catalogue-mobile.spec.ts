import { test, expect } from "@playwright/test";

/**
 * LE CATALOGUE MONTRE DES PRODUITS DANS SON PREMIER ÉCRAN (audit 2026-11-10, P0-5).
 *
 * Mesuré à 360 × 800 avant correction : la première carte commençait à 743 px,
 * c'est-à-dire exactement sous la barre du bas (57 px). Les puces d'univers et
 * de rayon s'enroulaient sur cinq lignes. Elles défilent désormais sur une
 * ligne chacune sous `sm` ; la première carte commence à 571 px.
 *
 * Seuil : 580 px, soit la mesure plus 9 px de marge de rendu. À 580, le visuel
 * carré de la première rangée tient entier au-dessus de la barre du bas.
 * Éprouvé dans l'autre sens le 2026-11-10 : remettre `flex-wrap` sur la rangée
 * des rayons fait rougir ce test dans les deux langues (671 px reçus).
 */
const SEUIL_PREMIERE_CARTE = 580;

for (const lang of ["ht", "fr"] as const) {
  test(`à 360 px, une rangée de cartes entre dans le premier écran (${lang})`, async ({ page, context, baseURL }) => {
    await context.addCookies([{ name: "zabelie_lang", value: lang, url: baseURL! }]);
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto("/catalogue", { waitUntil: "networkidle" });
    await expect(page.locator("html")).toHaveAttribute("lang", lang);

    const cartes = page.locator('main a[href^="/produit/"]');
    expect(await cartes.count(), "le catalogue de démonstration doit avoir des cartes à mesurer").toBeGreaterThan(1);
    const haut = await cartes.first().evaluate((e) => Math.round(e.getBoundingClientRect().top + scrollY));
    expect(haut).toBeLessThanOrEqual(SEUIL_PREMIERE_CARTE);

    // Les deux rangées de puces tiennent sur UNE ligne, et la page ne déborde pas.
    const univers = page.locator("main nav").filter({ has: page.locator(":scope > a.rounded-full") }).first();
    const rayons = page.locator("main div").filter({ has: page.locator(':scope > a.rounded-full[href*="cat="]') }).first();
    for (const rangee of [univers, rayons]) {
      const boite = await rangee.boundingBox();
      expect(boite, "rangée de puces introuvable").not.toBeNull();
      expect(boite!.height).toBeLessThanOrEqual(56);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

    // La dernière puce de rayon reste atteignable : elle défile, elle n'est pas coupée.
    const derniere = page.locator('main a[href*="cat="]').last();
    await derniere.scrollIntoViewIfNeeded();
    await expect(derniere).toBeInViewport();
  });
}
