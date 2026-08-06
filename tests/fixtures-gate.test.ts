import { test } from "node:test";
import assert from "node:assert/strict";

/**
 * Les fixtures de démo sont un OPT-IN, jamais un défaut.
 *
 * POURQUOI CE TEST EXISTE
 * -----------------------
 * Deux défauts distincts partageaient la même racine :
 *
 * 1. En mode non configuré, `getPublishedProducts()` rendait les six produits
 *    inventés de `lib/sample-data.ts` par DÉFAUT. La landing s'est donc
 *    toujours conçue devant un faux catalogue — jamais devant l'état réel du
 *    lancement, le catalogue vide, qui est précisément l'état à réussir.
 *
 * 2. Pire : en PRODUCTION (base configurée), `getProductView()` repliait sur
 *    les fixtures quand la requête échouait ou que le slug n'existait pas.
 *    `/produit/template-cv-pro` rendait un produit INVENTÉ, présenté comme
 *    achetable, signé d'un vendeur qui n'existe pas. La règle d'honnêteté
 *    commerciale interdit exactement cela.
 *
 * La garde : `ZABELIE_DEMO_FIXTURES=true` requis pour tout rendu de fixture,
 * et le chemin production ne replie JAMAIS (introuvable = introuvable).
 *
 * Vérifié sur cas connu-négatif avant commit : la garde retirée de
 * `demoView()`, les deux premiers tests échouent.
 */

// L'import est fait DANS les tests, après avoir fixé l'environnement : les
// fonctions lisent `process.env` à l'appel, mais l'isolation explicite évite
// qu'un ordre d'exécution futur ne crée une dépendance silencieuse.
async function libProducts() {
  return import("@/lib/products");
}

function demoEnv(fixtures: string | undefined) {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (fixtures === undefined) delete process.env.ZABELIE_DEMO_FIXTURES;
  else process.env.ZABELIE_DEMO_FIXTURES = fixtures;
}

test("sans drapeau : le mode démo ne montre RIEN d'inventé", async () => {
  demoEnv(undefined);
  const { getPublishedProducts, getProductView, getProductsForSitemap, getCatalogueCategories } =
    await libProducts();

  assert.deepEqual(await getPublishedProducts(), []);
  assert.deepEqual(await getCatalogueCategories(), []);
  assert.deepEqual(await getProductsForSitemap(), []);
  assert.equal(await getProductView("template-cv-pro"), undefined);
});

test("drapeau ≠ true (ex. « 1 ») : toujours rien — l'opt-in est littéral", async () => {
  demoEnv("1");
  const { getPublishedProducts } = await libProducts();
  assert.deepEqual(await getPublishedProducts(), []);
});

test("ZABELIE_DEMO_FIXTURES=true : les fixtures se rendent (connu-positif)", async () => {
  demoEnv("true");
  const { getPublishedProducts, getProductView } = await libProducts();

  const produits = await getPublishedProducts();
  assert.ok(produits.length >= 6, `fixtures attendues, obtenu ${produits.length}`);
  const fiche = await getProductView("template-cv-pro");
  assert.equal(fiche?.title, "Template CV pro — éditable Canva");
});

test("le chemin PRODUCTION de getProductView ne contient plus de repli fixture", () => {
  // Le chemin configuré exige un vrai client Supabase — injouable ici. On
  // vérifie donc la SOURCE, comme home-empty-state.test.ts, même limite
  // assumée : la garde est écrite, pas exécutée. Le repli fautif avait une
  // forme unique et reconnaissable : `sampleAsView().find` après la requête.
  const src = require("node:fs").readFileSync("lib/products.ts", "utf8");
  const replisFixture = src.match(/sampleAsView\(\)/g) ?? [];
  assert.equal(
    replisFixture.length,
    1,
    "sampleAsView() doit avoir UN SEUL appelant (demoView). Un second " +
      "appel est un repli fixture qui a repoussé — probablement sur un " +
      "chemin d'erreur production."
  );
});
