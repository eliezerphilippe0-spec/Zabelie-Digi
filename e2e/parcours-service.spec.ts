import { test, expect } from "@playwright/test";

/**
 * Parcours SERVICE — la fiche, et ce qu'elle ne doit surtout pas promettre.
 *
 * Pourquoi ce test existe (revue des kinds, 2026-08-13, TRV-03) : `service`
 * est le kind le MOINS couvert du dépôt — aucun état d'exécution, aucun filet
 * SQL — et le SEUL dont des commandes réelles existent en production. C'était
 * aussi le seul sans aucun parcours automatisé : la combinaison exacte qui a
 * déjà coûté sur le physique (voir l'en-tête de `parcours-physique.spec.ts` —
 * un kind que rien ne traverse, des fixtures qui mentent, une suite verte).
 *
 * Tourne contre le serveur DÉMO (`ZABELIE_DEMO_FIXTURES`, projet `chromium`) :
 * le produit vient de `lib/sample-data.ts` (`mentorat-design-1h`,
 * `KIND_SERVICE`).
 *
 * ⚠️ CE QUE CE TEST NE PROUVE PAS. Le post-achat d'un service — il n'existe
 * pas encore (SRV-01b, `docs/REVUE-KINDS-2026-08-13.md`) : pas d'état
 * d'exécution, pas d'acceptation acheteur. Quand ce chantier livrera, ce
 * fichier devra s'étendre au parcours `mes-achats`, comme le physique l'a
 * fait. D'ici là, il garde la moitié qui existe : la fiche dit la vérité.
 */

const FICHE = "/produit/mentorat-design-1h";

/**
 * Mots qui promettent un FICHIER. Un service n'en livre pas : chacun de ces
 * mots sur la fiche serait la promesse d'un téléchargement qui rendra 404
 * après paiement — le bug historique du `else` de `product-kind` (un type
 * inconnu héritait du « Téléchargement immédiat »).
 */
const PROMESSES_DE_FICHIER = [
  /téléchargement/i,
  /télécharger/i,
  /telechaj/i,
  /fichier livr/i,
  /download/i,
];

test.describe("Parcours service — la fiche", () => {
  test("la fiche s'affiche et ne promet aucun téléchargement", async ({ page }) => {
    await page.goto(FICHE);

    // La fiche du bon produit, pas une page de repli : le titre exact de la
    // fixture démo. Si la fixture disparaît ou change de slug, ce test doit
    // tomber ICI, bruyamment, pas dériver sur une autre assertion.
    await expect(
      page.getByRole("heading", { name: /Mentorat design produit/i })
    ).toBeVisible();

    // Le badge de type — la fiche DIT que c'est un service.
    // Pas de balise <main> sur la fiche (mesuré au premier passage de ce
    // test) : on vise `body`, ce qui élargit aussi l'assertion d'absence.
    await expect(page.locator("body")).toContainText(/Service/i);

    // Et elle ne promet RIEN d'un fichier. L'assertion porte sur tout le corps
    // rendu : un mot interdit dans un bloc replié compte autant qu'en héros.
    const corps = (await page.locator("body").textContent()) ?? "";
    for (const promesse of PROMESSES_DE_FICHIER) {
      expect(corps, `« ${promesse} » sur une fiche service`).not.toMatch(promesse);
    }
  });

  test("le chemin d'achat existe — un service se vend, pas seulement s'affiche", async ({
    page,
  }) => {
    await page.goto(FICHE);
    // La section d'achat de la fiche (`app/produit/[slug]/page.tsx`,
    // ancre #acheter). Sans elle, le kind est décoratif au catalogue.
    await expect(page.locator("#acheter")).toBeVisible();
    // Le prix de la fixture, affiché — 3 500 HTG (groupage manuel du site).
    await expect(page.locator("body")).toContainText(/3\s?500\s?HTG/);
  });

  test("le catalogue mène à la fiche service", async ({ page }) => {
    await page.goto("/catalogue");
    const carte = page.getByRole("link", { name: /Mentorat design produit/i });
    await expect(carte).toBeVisible();
    await carte.click();
    await expect(page).toHaveURL(new RegExp(FICHE.replace(/\//g, "\\/")));
  });
});
