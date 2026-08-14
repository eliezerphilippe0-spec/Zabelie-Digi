import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sousArbre, type ZoneNode } from "../lib/zones";

/**
 * PR-Z2 — le filtre catalogue par zone (`docs/33` §4).
 *
 * Deux choses gardées ici :
 *   1. Le SOUS-ARBRE, fonction pure — connu-positif ET connu-négatif, dont
 *      les deux cas que la vérif de la spec exige : « zone vide → 0
 *      résultat, pas d'erreur ».
 *   2. Les COMMANDES dans `lib/products.ts` — la condition qui active le
 *      filtre et la sentinelle qui traduit « aucun vendeur » en zéro
 *      résultat. Assertions sur ce qui commande, jamais sur un libellé
 *      (règle `CLAUDE.md`) : `if (false)` doit rougir autant qu'une
 *      suppression.
 */

/** La hiérarchie du seed, en miniature : 1 depatman, 2 komin, 2 katye. */
const H: ZoneNode[] = [
  { id: "nord", parent_id: null },
  { id: "okap", parent_id: "nord" },
  { id: "limonade", parent_id: "nord" },
  { id: "carenage", parent_id: "okap" },
  { id: "petite-anse", parent_id: "okap" },
  { id: "ouest", parent_id: null },
  { id: "petionville", parent_id: "ouest" },
];

test("sous-arbre — connu-POSITIF : une komin inclut ses katye, un depatman inclut tout", () => {
  assert.deepEqual(
    sousArbre(H, "okap").sort(),
    ["carenage", "okap", "petite-anse"],
  );
  assert.deepEqual(
    sousArbre(H, "nord").sort(),
    ["carenage", "limonade", "nord", "okap", "petite-anse"],
  );
});

test("sous-arbre — un katye est une feuille : lui seul", () => {
  assert.deepEqual(sousArbre(H, "carenage"), ["carenage"]);
});

test("sous-arbre — connu-NÉGATIF : il n'aspire jamais un voisin", () => {
  // Le sous-arbre de l'Ouest ne contient RIEN du Nord — c'est le test qui
  // rougirait si la fonction rendait « toutes les zones » par accident,
  // c'est-à-dire un filtre qui n'a pas pris.
  assert.deepEqual(sousArbre(H, "ouest").sort(), ["ouest", "petionville"]);
});

test("sous-arbre — zone inconnue de la liste : elle seule, jamais tout", () => {
  /* En aval, aucun vendeur ne porte cet id → sentinelle → zéro résultat.
   * L'alternative — rendre [] ou tout — afficherait le catalogue entier
   * sous une zone inexistante, sans dire que le filtre n'a pas pris. */
  assert.deepEqual(sousArbre(H, "zone-fantome"), ["zone-fantome"]);
});

test("sous-arbre — un cycle dans les données TERMINE, sans rien inventer", () => {
  // ZB069 rend le cycle impossible en base ; le helper pur n'en dépend pas.
  const cyclique: ZoneNode[] = [
    { id: "a", parent_id: "b" },
    { id: "b", parent_id: "a" },
  ];
  assert.deepEqual(sousArbre(cyclique, "a").sort(), ["a", "b"]);
});

// ── Les commandes dans lib/products.ts ──────────────────────────────────────

const PRODUCTS = readFileSync("lib/products.ts", "utf8");

test("le filtre zone est COMMANDÉ par filters.zoneId et résolu hors requête", () => {
  assert.match(
    PRODUCTS,
    /if \(filters\.zoneId\)\s*\{\s*zoneSellerIds = await getSellerIdsInZone\(filters\.zoneId\)/,
    "la résolution du sous-arbre n'est plus commandée par filters.zoneId",
  );
});

test("« aucun vendeur dans la zone » passe par la sentinelle, jamais « pas de filtre »", () => {
  assert.match(
    PRODUCTS,
    /zoneSellerIds\.length > 0 \? zoneSellerIds : \[ZERO_UUID\]/,
    "la liste vide doit filtrer sur ZERO_UUID (zéro résultat), pas être ignorée",
  );
});

test("le mode démo rend zéro résultat sous un filtre zone — pas le catalogue entier", () => {
  assert.match(
    PRODUCTS,
    /filters\.zoneId \? \[\] : filterSample/,
    "en démo (fixtures sans zone), un filtre zone doit rendre zéro résultat",
  );
});
