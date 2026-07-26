import { test, expect } from "@playwright/test";

/**
 * La fiche produit est diffusée par lien WhatsApp. Tant que la navigation par
 * rayons n'existe pas, la carte d'aperçu EST la page d'accueil de la plupart
 * des acheteurs : si elle est générique, le lien arrive nu dans le groupe et
 * le clic ne se fait pas.
 *
 * Régression corrigée ici : la page n'avait pas de `generateMetadata`. Le titre
 * et la description retombaient sur ceux du layout racine — identiques pour
 * toutes les fiches, sans nom de produit ni prix.
 */

const PRODUCT = "/produit/pack-presets-lightroom-afro";
const TITRE_GENERIQUE = "Zabelie — La marketplace haïtienne";

const meta = (page: import("@playwright/test").Page, property: string) =>
  page.locator(`meta[property="${property}"]`).getAttribute("content");

test.describe("Aperçu de partage de la fiche produit", () => {
  test("le titre et la description portent le produit, pas le site", async ({
    page,
  }) => {
    await page.goto(PRODUCT);

    const ogTitle = await meta(page, "og:title");
    expect(ogTitle, "og:title absent").toBeTruthy();
    expect(
      ogTitle,
      "og:title est celui du site : toutes les fiches partagées se ressemblent"
    ).not.toBe(TITRE_GENERIQUE);
    // Le prix décide le clic dans un fil de discussion — il doit y être.
    expect(ogTitle).toMatch(/HTG/);

    const ogDesc = await meta(page, "og:description");
    expect(ogDesc, "og:description absente").toBeTruthy();
    expect(ogDesc).toMatch(/HTG/);
    expect(ogDesc).toMatch(/par /);

    // Le <title> de l'onglet suit la même règle.
    await expect(page).not.toHaveTitle(TITRE_GENERIQUE);
  });

  test("l'image d'aperçu est absolue et servie en 1200×630", async ({
    page,
    request,
  }) => {
    await page.goto(PRODUCT);

    const img = await meta(page, "og:image");
    expect(img, "og:image absente : pas de vignette sur WhatsApp").toBeTruthy();
    // Une URL relative n'est pas résolue par les robots de prévisualisation.
    expect(img!, "og:image doit être absolue").toMatch(/^https?:\/\//);

    expect(await meta(page, "og:image:width")).toBe("1200");
    expect(await meta(page, "og:image:height")).toBe("630");

    const res = await request.get(img!);
    expect(res.status(), "l'image d'aperçu ne se génère pas").toBe(200);
    expect(res.headers()["content-type"]).toContain("image/png");
  });

  test("le bloc compatibilité n'est jamais imbriqué dans la liste", async ({
    page,
  }) => {
    await page.goto(PRODUCT);

    // Il n'apparaît que sur un produit physique (absent en mode démo) : s'il
    // est là, il doit être un frère de la liste de réassurance, jamais un
    // descendant d'un <li> — un <ul> dans un <li> d'une autre liste est du
    // HTML invalide, et le rendu casse là où personne ne regarde.
    const bloc = page.locator("p", { hasText: /^Compatible avec$/ });
    if ((await bloc.count()) > 0) {
      expect(await bloc.first().locator("xpath=ancestor::li").count()).toBe(0);
    }
  });
});
