import { test, expect } from "@playwright/test";

/**
 * Lien mort : un VRAI 404, décidé par le proxy (lib/existence-publique.ts).
 * Le stub ne publie qu'un produit, `filtre-huile-corolla`.
 */

test("un produit publié répond 200, un produit inconnu répond 404 avec une sortie", async ({ request }) => {
  expect((await request.get("/produit/filtre-huile-corolla")).status()).toBe(200);

  const mort = await request.get("/produit/sak-pay-ble");
  expect(mort.status()).toBe(404);
  const html = await mort.text();
  expect(html).toContain("Cet article n&#x27;est plus disponible");
  expect(html).toContain("/catalogue?q=sak%20pay%20ble");
  expect(html).toMatch(/<meta name="robots" content="noindex/);

  // Un vérificateur de liens (HEAD) reçoit la même réponse.
  expect((await request.head("/produit/sak-pay-ble")).status()).toBe(404);
});

test("la langue de l'adresse est gardée sur l'écran du lien mort", async ({ request }) => {
  const r = await request.get("/ht/produit/sak-pay-ble");
  expect(r.status()).toBe(404);
  expect(await r.text()).toContain("Atik sa a pa disponib ankò");
});

test("une navigation dans l'application n'attend pas la base", async ({ request }) => {
  // fetch interne du navigateur (Sec-Fetch-Dest: empty) : le proxy laisse
  // passer, la page dit « introuvable » elle-même, sans l'écran du lien mort.
  const r = await request.get("/produit/sak-pay-ble", { headers: { RSC: "1", "Sec-Fetch-Dest": "empty" } });
  expect(await r.text()).not.toContain("plus disponible");
  // Une page ouverte dans le navigateur, elle, est tranchée.
  const page = await request.get("/produit/sak-pay-ble", { headers: { "Sec-Fetch-Dest": "document" } });
  expect(page.status()).toBe(404);
});

test("guides et créateurs : forme ou liste fixe, sans base", async ({ request }) => {
  expect((await request.get("/guides/fr/acheter-en-haiti")).status()).toBe(200);
  expect((await request.get("/guides/fr/inexistant")).status()).toBe(404);
  expect((await request.get("/guides/de")).status()).toBe(404);
  expect((await request.get("/createur/pas-un-identifiant")).status()).toBe(404);
});
