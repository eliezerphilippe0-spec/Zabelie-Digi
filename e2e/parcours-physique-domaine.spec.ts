import { test, expect } from "@playwright/test";

/**
 * Domaine personnalisé (0125). Le stub ne connaît qu'un domaine actif :
 * `boutik-mari.ht`. L'en-tête Host simule la requête arrivée par ce domaine.
 */
const DOMAINE = { host: "boutik-mari.ht" };

test("la racine du domaine vendeur sert la boutique, avec les régies ouvertes pour ses pixels", async ({ request }) => {
  const r = await request.get("/", { headers: DOMAINE });
  expect(r.status()).toBe(200);
  expect(await r.text()).toContain("Garaj Petyonvil");
  expect(r.headers()["content-security-policy"]).toContain("https://connect.facebook.net");
});

test("tout autre chemin repart vers zabelie.com, signé — le paiement n'a jamais lieu sur le domaine", async ({ request }) => {
  for (const chemin of ["/produit/kit-depart", "/connexion", "/api/checkout", "/paiement/succes?x=1"]) {
    const r = await request.get(chemin, { headers: DOMAINE, maxRedirects: 0 });
    expect(r.status(), chemin).toBe(308);
    expect(r.headers()["x-zabelie-domaine"]).toBe("boutik-mari.ht");
    const vers = new URL(r.headers()["location"]);
    expect(vers.host, chemin).not.toBe("boutik-mari.ht");
    expect(vers.pathname + vers.search).toBe(chemin);
  }
});

test("un domaine inconnu ne sert rien : un vrai 404, sans régies", async ({ request }) => {
  const inconnu = await request.get("/", { headers: { host: "inconnu.ht" } });
  expect(inconnu.status()).toBe(404);
  expect(inconnu.headers()["content-security-policy"]).not.toContain("facebook");
  // Témoin : l'hôte Zabelie sert toujours le site, pas une boutique.
  const accueil = await request.get("/");
  expect(accueil.status()).toBe(200);
  expect(accueil.headers()["x-zabelie-domaine"]).toBeUndefined();
});
