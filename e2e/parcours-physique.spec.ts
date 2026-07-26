import { test, expect, type Page } from "@playwright/test";

/**
 * Parcours PRODUIT PHYSIQUE de bout en bout.
 *
 * Le test qui manquait. Les fixtures SQL créaient les « produits physiques »
 * avec `kind = 'fichier'` : la suite verte confirmait donc le mensonge, et
 * aucun `kind = 'physical'` n'avait jamais traversé le flux nulle part.
 *
 * Deux affirmations, et ce sont les deux qui comptent :
 *   1. une commande physique n'atteint JAMAIS `delivered` par la route de
 *      téléchargement — c'est cette route qui écrit l'état ;
 *   2. aucune surface acheteur ne prononce le mot « fichier » sur son
 *      parcours.
 *
 * Tourne contre `e2e/fixtures/stub-supabase.mjs` (produit publié de force :
 * depuis la décision « la saisie crée un brouillon », un physique n'atteint
 * plus le checkout par le chemin normal).
 */

const STUB = "http://127.0.0.1:54321";
const ORDER_ID = "33333333-3333-3333-3333-333333333333";
const SLUG = "filtre-huile-corolla";

/**
 * Session Supabase posée en cookie. `@supabase/ssr` lit
 * `sb-<premier segment d'hôte>-auth-token`, encodé en base64url préfixé.
 */
async function connecte(page: Page) {
  const session = {
    access_token: "jeton-de-test",
    refresh_token: "rafraichissement-de-test",
    token_type: "bearer",
    expires_in: 3600,
    // Très loin dans le futur : sinon le client tente un rafraîchissement.
    expires_at: 4102444800,
    user: {
      id: "11111111-1111-1111-1111-111111111111",
      aud: "authenticated",
      role: "authenticated",
      email: "achte@example.ht",
      app_metadata: {},
      user_metadata: {},
      created_at: "2026-01-01T00:00:00Z",
    },
  };
  const value =
    "base64-" + Buffer.from(JSON.stringify(session), "utf8").toString("base64url");
  await page.context().addCookies([
    { name: "sb-127-auth-token", value, domain: "127.0.0.1", path: "/" },
  ]);
}

/** Mots qui promettent un fichier. Aucun n'a sa place sur un parcours physique. */
const MOTS_INTERDITS = [
  /fichier/i,
  /fichye/i,
  /télécharg/i,
  /telechaj/i,
  /download/i,
  /livraison instantanée/i,
];

async function verifieAucunePromesseDeFichier(page: Page, ou: string) {
  const texte = (await page.locator("body").innerText()).normalize("NFC");
  for (const mot of MOTS_INTERDITS) {
    expect(texte, `${ou} promet un fichier (${mot})`).not.toMatch(mot);
  }
}

test.describe("Parcours produit physique", () => {
  test("la fiche ne promet ni fichier ni livraison instantanée", async ({ page }) => {
    await page.goto(`/produit/${SLUG}`);

    await expect(page.getByRole("heading", { name: /Filtre à huile/ })).toBeVisible();
    // Ce que le vendeur déclare, attribué à lui — Zabelie ne livre pas.
    await expect(page.getByText("Livraison à convenir avec le vendeur")).toBeVisible();
    await expect(page.getByText("Produit physique")).toBeVisible();

    await verifieAucunePromesseDeFichier(page, "la fiche produit");
  });

  test("l'aperçu de partage n'annonce pas un produit digital", async ({ page }) => {
    await page.goto(`/produit/${SLUG}`);
    const title = await page
      .locator('meta[property="og:title"]')
      .getAttribute("content");
    expect(title).toContain("Filtre à huile");
    // La carte reçue sur WhatsApp portait « Produit digital · Livraison
    // instantanée » sur une pièce détachée.
    const desc = await page
      .locator('meta[property="og:description"]')
      .getAttribute("content");
    expect(desc).not.toMatch(/fichier|instantané/i);
  });

  test("« Mes achats » ne propose pas de téléchargement", async ({ page }) => {
    await connecte(page);
    await page.goto("/mes-achats");

    await expect(page.getByText("Filtre à huile Corolla")).toBeVisible();
    await expect(page.getByText("Remise à convenir avec le vendeur")).toBeVisible();
    await verifieAucunePromesseDeFichier(page, "la page « Mes achats »");
  });

  test("la route de téléchargement refuse, et n'écrit jamais `delivered`", async ({
    page,
    request,
  }) => {
    await connecte(page);

    // Appel direct : c'est le chemin qu'emprunterait un acheteur qui a gardé
    // le lien, ou un bouton laissé par erreur sur une autre surface.
    const res = await page.request.get(`/api/download?orderId=${ORDER_ID}`);
    expect(res.status(), "un produit physique ne se télécharge pas").toBe(409);
    expect((await res.json()).code).toBe("non_telechargeable");

    // La preuve qui compte : AUCUNE écriture sur `orders`. Le refus doit
    // précéder la recherche de livrable, sinon la commande passait
    // `delivered` pour une remise qui n'a jamais eu lieu.
    const ecritures = await (await request.get(`${STUB}/__ecritures`)).json();
    expect(
      ecritures,
      "la route a écrit sur orders alors qu'elle aurait dû refuser"
    ).toEqual([]);
  });
});
