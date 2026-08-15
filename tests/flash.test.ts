import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * Ventes flash (docs/37 §B, migration 0080) — ce qui doit rester vrai.
 *
 * Les assertions portent sur ce qui COMMANDE (conditions, appels, liaisons),
 * jamais sur les libellés — et chaque intervalle [\s\S]{0,N} a une extrémité
 * qui porte la LIAISON (CLAUDE.md, « la régression de proximité »).
 */

const CHECKOUT = readFileSync("app/api/checkout/route.ts", "utf8");
const LIB = readFileSync("lib/flash.ts", "utf8");
const FICHE = readFileSync("app/produit/[slug]/page.tsx", "utf8");
const ROUTE = readFileSync("app/api/products/flash/route.ts", "utf8");
const MIG = readFileSync("supabase/migrations/0080_flash_sales.sql", "utf8");
const SQL_TESTS = readFileSync("supabase/tests/flash.test.sql", "utf8");

test("checkout : le prix flash est RELU au serveur, jamais cru depuis l'affichage", () => {
  // La liaison : finalPriceHtg reçoit la valeur de l'offre lue en base.
  assert.match(
    CHECKOUT,
    /const flash = await offreFlashActive\(admin, product\.id\);[\s\S]{0,900}finalPriceHtg = flash\.prixFlashHtg/,
    "Le prix payé doit venir de l'offre relue par le serveur au moment du checkout."
  );
});

test("checkout : flash et coupon ne se cumulent JAMAIS", () => {
  // La condition avec sa cible : dans la branche `if (flash)`, un coupon
  // saisi rend un refus explicite.
  assert.match(
    CHECKOUT,
    /if \(flash\) \{\s*\n\s*if \(typeof couponInput === "string" && couponInput\.trim\(\)\) \{[\s\S]{0,500}status: 422/,
    "Un coupon pendant une vente flash doit être refusé, jamais empilé ni ignoré en silence."
  );
  // Et le chemin coupon normal est CONDITIONNÉ à l'absence de flash.
  assert.match(
    CHECKOUT,
    /if \(!flash && typeof couponInput === "string"/,
    "Le bloc coupon doit être gardé par !flash — sinon les deux remises s'empilent."
  );
});

test("checkout : l'épuisement des unités bloque AVANT la commande", () => {
  assert.match(
    CHECKOUT,
    /if \(await flashEpuisee\(admin, product\.id, flash\)\)[\s\S]{0,300}status: 409/
  );
});

test("lib/flash : la fenêtre est une comparaison de dates en BASE, pas un cron", () => {
  // Ce qui commande la vivacité : annulee_a null, debut <= now < fin.
  assert.match(LIB, /\.is\("annulee_a", null\)/);
  assert.match(LIB, /\.gt\("fin", new Date\(\)\.toISOString\(\)\)/);
  assert.match(LIB, /\.lte\("debut", new Date\(\)\.toISOString\(\)\)/);
});

test("fiche : le prix affiché est COMMANDÉ par l'offre, le flash prime sur le rabais", () => {
  assert.match(
    FICHE,
    /formatHTG\(flash \? flash\.prixFlashHtg : product\.priceHTG\)/,
    "Le grand prix doit basculer sur l'offre flash quand elle existe."
  );
  // Le compte à rebours reçoit la fin SERVEUR — jamais une date recalculée client.
  assert.match(FICHE, /<FlashCountdown fin=\{flash\.fin\}/);
});

test("route flash : la propriété du produit commande l'accès", () => {
  assert.match(
    ROUTE,
    /data\.seller_id !== userId[\s\S]{0,80}return null/,
    "Créer ou annuler l'offre d'un produit exige d'en être le vendeur."
  );
});

test("0080 : les bornes viennent de la CONFIG, lues dans le trigger", () => {
  // La liaison : v_cfg est affecté depuis la table, puis comparé.
  assert.match(
    MIG,
    /select \* into v_cfg from zabelie_flash_config;[\s\S]{0,900}v_cfg\.rabais_min_pct/,
    "Le trigger doit lire les bornes en config — règle dure n°3, rien en dur."
  );
  assert.match(MIG, /create trigger zabelie_flash_garde_trg/);
  // Aucune policy d'écriture — redit en post-condition dans la migration.
  assert.match(MIG, /cmd in \('INSERT', 'UPDATE', 'DELETE'\)[\s\S]{0,200}raise exception/);
});

test("0080 : le prix d'origine ne bouge jamais — la migration ne touche pas products.price_htg", () => {
  assert.ok(
    !/update products/i.test(MIG),
    "0080 ne doit jamais écrire dans products : l'offre expire, le prix n'a pas à revenir."
  );
});

test("la suite SQL éprouve les cinq familles de refus", () => {
  for (const marqueur of ["F1 OK", "F2 OK", "F3 OK", "F4 OK", "F5 OK"]) {
    assert.ok(
      SQL_TESTS.includes(marqueur),
      `supabase/tests/flash.test.sql doit porter ${marqueur}`
    );
  }
});
