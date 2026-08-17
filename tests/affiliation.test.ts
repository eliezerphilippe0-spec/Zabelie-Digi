import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { REF_COOKIE, REF_COOKIE_JOURS, CODE_RE, genererCode } from "../lib/affiliation";

/**
 * Affiliation (docs/37 §A, option B — migration 0081) — ce qui doit rester
 * vrai. Assertions sur ce qui COMMANDE ; chaque proximité porte sa liaison.
 */

const MIG = readFileSync("supabase/migrations/0081_affiliation.sql", "utf8");
const CHECKOUT = readFileSync("app/api/checkout/route.ts", "utf8");
const PROXY = readFileSync("proxy.ts", "utf8");
const LIB = readFileSync("lib/affiliation.ts", "utf8");
const SQL_TESTS = readFileSync("supabase/tests/affiliation.test.sql", "utf8");

test("0081 : DORMANTE à l'application — et la post-condition le redit en base", () => {
  assert.match(MIG, /actif\s+boolean not null default false/);
  assert.match(
    MIG,
    /if \(select actif from zabelie_affiliate_config\) then[\s\S]{0,200}raise exception/,
    "Un défaut changé à true doit CASSER l'application, pas armer en silence."
  );
});

test("0081 : le garde d'origine refuse d'écraser un corps de production inattendu", () => {
  // La leçon 0072/0079, et sa version durcie : la prod portait la branche
  // stock de 0038 qu'AUCUN fichier de migration ne montre seule.
  assert.match(
    MIG,
    /position\('zabelie_consume_stock_strict' in v_confirm\) = 0[\s\S]{0,250}raise exception/,
    "Sans ce garde, appliquer 0081 sur un corps inconnu perdrait un mécanisme en silence."
  );
  // Et la post-condition croise les QUATRE mécanismes qui doivent coexister.
  assert.match(
    MIG,
    /position\('zabelie_consume_stock_strict' in v_confirm\) = 0\s*\n\s*or position\('zabelie_coupon_consume' in v_confirm\) = 0\s*\n\s*or position\('expected_usd_cents' in v_confirm\) = 0\s*\n\s*or position\('affiliate_credit' in v_confirm\) = 0/
  );
});

test("0081 : la contrainte d'escrow s'élargit et ses DEUX lecteurs changent ensemble", () => {
  assert.match(MIG, /add constraint escrow_entries_order_wallet_key unique \(order_id, wallet_id\)/);
  // confirm_payment écrit avec le nouveau conflict target…
  assert.match(MIG, /on conflict \(order_id, wallet_id\) do nothing/);
  // …et refund_order boucle au lieu du select à ligne unique.
  assert.match(
    MIG,
    /for v_esc in\s*\n\s*select \* from escrow_entries where order_id = p_order_id/,
    "Le select à ligne unique rembourserait UN des deux escrows, au hasard."
  );
  // La clé d'idempotence du débit porte le wallet — deux débits distincts.
  assert.match(MIG, /'order_refund:' \|\| p_order_id \|\| ':' \|\| v_esc\.wallet_id/);
});

test("0081 : la cascade prélève sur le NET, au taux FIGÉ, jamais si affilié = vendeur", () => {
  assert.match(
    MIG,
    /if found and v_attrib\.affiliate_id <> v_seller_id then[\s\S]{0,120}v_aff := floor\(v_net \* v_attrib\.rate_bps/,
    "Le taux vient de l'ATTRIBUTION (figée à la commande), pas de la table des taux du jour."
  );
  // Le crédit affilié vit DANS le bloc idempotent du crédit vendeur.
  assert.match(MIG, /'affiliate_credit:' \|\| v_order\.id/);
});

test("checkout : l'attribution est écrite à la CRÉATION de commande, best-effort", () => {
  // La liaison : l'ordre vient d'être créé, son id passe à l'attribution.
  assert.match(
    CHECKOUT,
    /await attribuerCommande\(admin, \{\s*\n\s*orderId: order\.id/,
    "L'attribution se fige à la commande (leçon Jumia) — jamais au paiement."
  );
  // Et le cookie est revalidé par la MÊME regex que la contrainte SQL.
  assert.match(CHECKOUT, /CODE_RE\.test\(refCookie\)/);
});

test("lib : l'attribution refuse l'auto-parrainage et ne casse JAMAIS un checkout", () => {
  assert.match(
    LIB,
    /aff\.user_id === args\.buyerId \|\| aff\.user_id === args\.sellerId[\s\S]{0,40}return/,
    "Un acheteur qui se parraine lui-même toucherait une remise déguisée."
  );
  // Le contrat best-effort : le catch avale, le checkout vit.
  assert.match(LIB, /catch \{\s*\n\s*\/\/ Silencieux par contrat/);
});

test("proxy : le cookie n'est posé que sur un code au format STRICT", () => {
  assert.match(
    PROXY,
    /if \(ref && REF_CODE_RE\.test\(ref\)\)[\s\S]{0,200}response\.cookies\.set/,
    "Sans validation, n'importe quelle chaîne entrerait en cookie."
  );
});

test("proxy et lib : les constantes recopiées n'ont pas divergé", () => {
  // Le proxy Edge ne peut pas importer lib/affiliation — les valeurs sont
  // recopiées, et CE test est le croisement qui interdit la divergence.
  assert.match(PROXY, new RegExp(`REF_COOKIE_NOM = "${REF_COOKIE}"`));
  assert.match(PROXY, new RegExp(`REF_COOKIE_JOURS_N = ${REF_COOKIE_JOURS}`));
  assert.match(PROXY, new RegExp(`REF_CODE_RE = ${CODE_RE.toString().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
});

test("genererCode : conforme à la contrainte SQL, sans caractères ambigus", () => {
  for (let i = 0; i < 50; i++) {
    const c = genererCode();
    assert.match(c, CODE_RE);
    assert.doesNotMatch(c, /[l1o0]/, "l/1/o/0 se confondent sur un écran d'entrée de gamme");
  }
});

test("la suite SQL éprouve la cascade, le rejeu, le refund double et la dormance", () => {
  for (const m of ["A1+A2 OK", "A3 OK", "A4 OK", "A5 OK", "A6 OK"]) {
    assert.ok(SQL_TESTS.includes(m), `supabase/tests/affiliation.test.sql doit porter ${m}`);
  }
  // Le chiffre qui compte, écrit en clair : 1000 = 100 + 180 + 720.
  assert.match(SQL_TESTS, /1000 = 100 \+ 180 \+ 720/);
});
