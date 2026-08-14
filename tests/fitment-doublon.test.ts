import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * Le doublon de compatibilité DIT son nom (2026-08-14).
 *
 * Le premier vrai test vendeur après la réparation de la clé service-role a
 * rendu « Création échouée » sur un 409 de `fitment_unique` — un doublon de
 * SAISIE — et ce message générique a fait accuser la clé. Le garde ici :
 * la branche 23505 existe, nettoie, et répond 422 avec la cause. Assertions
 * sur ce qui commande (le code d'erreur, le nettoyage, le statut), pas sur
 * le libellé seul.
 */

const ROUTE = readFileSync("app/api/products/physical/route.ts", "utf8");

test("le doublon de compatibilité (23505) répond 422 avec sa cause, après nettoyage", () => {
  const branche = ROUTE.slice(ROUTE.indexOf('fitErr.code === "23505"'));
  assert.ok(branche.length > 30, "la branche 23505 du fitment a disparu");
  const nettoyage = branche.indexOf('from("products").delete()');
  const reponse = branche.indexOf("status: 422");
  assert.ok(nettoyage > -1, "le doublon ne nettoie plus le produit orphelin");
  assert.ok(reponse > -1, "le doublon ne répond plus 422");
  assert.ok(
    nettoyage < reponse,
    "la réponse part avant le nettoyage — un produit orphelin resterait",
  );
});

test("les autres échecs de fitment gardent le chemin abort générique", () => {
  assert.match(
    ROUTE,
    /return abort\("insert fitment", fitErr\)/,
    "le repli abort du fitment a disparu — un échec inconnu ne nettoierait plus",
  );
});
