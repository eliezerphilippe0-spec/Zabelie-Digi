import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { jointureAmbigue, tableDe } from "../e2e/fixtures/jointures-postgrest.mjs";

/**
 * LA JOINTURE COMMANDE → PRODUIT NOMME SA CLÉ.
 *
 * `0111` (2026-09-22) a ajouté `orders.zabelie_recommendation_source_id`, une
 * seconde clé vers `products`. Le vrai PostgREST refuse depuis toute jointure
 * `orders` → `products` qui ne dit pas laquelle (300 PGRST201) : la page de
 * succès d'un vrai paiement, mes achats, mes ventes, le retour MonCash, le
 * suivi de commande, les e-mails de vente, les avis de remise, le comptage
 * avant fermeture d'un compte et l'API vendeur lisaient du vide. Personne ne
 * l'a vu : aucun paiement réel, et des faux serveurs qui acceptaient tout.
 *
 * Deux gardes : les faux serveurs refusent maintenant ces jointures comme la
 * production (`e2e/fixtures/jointures-postgrest.mjs`), et ce test lit tout le
 * code, y compris les chemins qu'aucun parcours e2e ne traverse.
 */

const CLE = "products!orders_product_id_fkey";

test("J1 — le détecteur refuse ce que refuse PostgREST, et seulement cela", () => {
  // Formes mesurées le 2026-10-17 contre le vrai PostgREST : refusées…
  assert.ok(jointureAmbigue("orders", "id,product:products(title)"));
  assert.ok(jointureAmbigue("orders", "id,products!inner(seller_id)"));
  assert.ok(jointureAmbigue("orders", "status, products(slug)"));
  assert.ok(jointureAmbigue("zabelie_fulfillment", "order_id, order:orders!inner(id, products!inner(title))"));
  // … et acceptées.
  assert.ok(!jointureAmbigue("orders", `id,product:${CLE}(title)`));
  assert.ok(!jointureAmbigue("orders", `id,${CLE}!inner(seller_id)`));
  assert.ok(!jointureAmbigue("zabelie_fulfillment", `order:orders!inner(id, ${CLE}!inner(title))`));
  // Une autre table vers les produits n'a qu'une clé : rien à nommer.
  assert.ok(!jointureAmbigue("zabelie_cart_items", "product_id, product:products(title)"));
  assert.ok(!jointureAmbigue("zabelie_flash_sales", "product_id, products!inner(seller_id)"));
  assert.equal(tableDe("/rest/v1/orders"), "orders");
});

function fichiers(dossier: string): string[] {
  return readdirSync(dossier).flatMap((nom) => {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) return fichiers(chemin);
    return /\.(ts|tsx)$/.test(nom) ? [chemin] : [];
  });
}

const PRODUIT_SANS_CLE = /(^|[\s,(:"'`])products(!inner)?\(/g;
const FROM = /\.from\(\s*["'`]([a-z_]+)["'`]\s*\)/g;

/**
 * Chaque jointure `products(` sans clé du code, rattachée à la table de sa
 * requête : le `.from()` qui la précède dans la même instruction, ou celui qui
 * la suit de près quand la sélection est préparée dans une variable juste
 * avant (`mes-achats`).
 */
function jointuresSurCommandes(source: string): number[] {
  const froms = [...source.matchAll(FROM)].map((m) => ({ i: m.index!, table: m[1] }));
  const fautes: number[] = [];
  for (const m of source.matchAll(PRODUIT_SANS_CLE)) {
    const p = m.index!;
    const avant = froms.filter((f) => f.i < p).at(-1);
    const apres = froms.find((f) => f.i > p);
    const table = avant && p - avant.i < 600 ? avant.table : apres && apres.i - p < 400 ? apres.table : null;
    const ligne = source.slice(0, p).split("\n").length;
    if (table === "orders") fautes.push(ligne);
    // Imbriquée dans une jointure vers les commandes, depuis une autre table.
    const debutInstruction = Math.max(0, source.lastIndexOf(";", p),source.lastIndexOf("\n\n", p));
    if (jointureAmbigue("", source.slice(debutInstruction, p + m[0].length + 200))) fautes.push(ligne);
  }
  return [...new Set(fautes)];
}

test("J2 — aucune requête du code ne joint les commandes aux produits sans nommer la clé", () => {
  const fautes: string[] = [];
  for (const f of ["app", "lib", "components"].flatMap(fichiers)) {
    for (const ligne of jointuresSurCommandes(readFileSync(f, "utf8"))) fautes.push(`${f}:${ligne}`);
  }
  assert.deepEqual(fautes, [], `Écrire « ${CLE} » au lieu de « products » :\n  ` + fautes.join("\n  "));
});

test("J3 — le lecteur du code voit les formes cassées (connu-positif)", () => {
  const cas = [
    `await admin.from("orders").select("id, product:products(title)").eq("id", x);`,
    `const relation = "product:products(id)";\n    let q = client.from("orders")\n      .select(relation);`,
    `await admin.from("zabelie_fulfillment").select("order:orders!inner(id, products!inner(title))");`,
  ];
  for (const c of cas) assert.equal(jointuresSurCommandes(c).length, 1, c);
  assert.equal(jointuresSurCommandes(`await admin.from("zabelie_cart_items").select("product:products(title)");`).length, 0);
  assert.equal(jointuresSurCommandes(`await admin.from("orders").select("product:${CLE}(title)");`).length, 0);
});
