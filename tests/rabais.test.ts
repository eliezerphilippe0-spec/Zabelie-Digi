import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pourcentageRabais } from "../lib/product-discount";

/**
 * Rabais (V-4, docs/35) — la règle d'honnêteté se teste en SQL (D1-D5, CI) ;
 * ici : le pourcentage, la migration (structurel), la route, les surfaces.
 */

test("pourcentageRabais : arrondi correct, jamais négatif ni sur données absurdes", () => {
  assert.equal(pourcentageRabais(2000, 1500), 25);
  assert.equal(pourcentageRabais(1000, 999), 0); // 0,1 % → arrondi 0
  assert.equal(pourcentageRabais(1000, 1000), 0);
  assert.equal(pourcentageRabais(0, 500), 0);
  assert.equal(pourcentageRabais(1000, 1200), 0);
});

const SQL = readFileSync("supabase/migrations/0075_rabais.sql", "utf8");

test("0075 : la règle d'honnêteté est STRUCTURELLE — contrainte en base, barré copié du prix pratiqué", () => {
  assert.match(SQL, /check \(compare_at_htg is null or compare_at_htg > price_htg\)/);
  // Le barré vient du prix courant (ou de l'ORIGINE si rabais existant) —
  // jamais d'un paramètre : la RPC ne REÇOIT aucun prix barré.
  assert.match(SQL, /compare_at_htg = coalesce\(compare_at_htg, price_htg\)/);
  assert.ok(
    !/p_compare|p_old_price|p_ancien/.test(SQL),
    "la RPC ne doit accepter AUCUN prix barré fourni par l'appelant"
  );
  // La variante unique suit dans la même transaction (chemin d'argent).
  assert.match(SQL, /if v_variants = 1 then[\s\S]{0,200}set price_htg = p_new_price_htg/);
  assert.match(SQL, /v_variants > 1[\s\S]{0,120}variantes_multiples/);
});

const ROUTE = readFileSync("app/api/products/discount/route.ts", "utf8");

test("route discount : auth, RPC seule (aucun UPDATE direct), 503 sans 0075", () => {
  assert.match(ROUTE, /if \(!user\)[\s\S]{0,200}status: 401/);
  assert.match(ROUTE, /rpc\("zabelie_set_discount"/);
  assert.match(ROUTE, /rpc\("zabelie_clear_discount"/);
  assert.ok(!/\.update\(/.test(ROUTE), "le prix ne se touche que par la RPC");
  assert.match(ROUTE, /isMissingFunction\(error\)[\s\S]{0,300}status: 503/);
});

test("surfaces : fiche (barré + pourcentage, conditionnés), vendeur (manager monté)", () => {
  const fiche = readFileSync("app/produit/[slug]/page.tsx", "utf8");
  // Depuis 0080, le barré rabais vit dans la branche SANS flash — la
  // condition est la même, la mise en page a changé (flash prime).
  assert.match(fiche, /compareHtg &&\s*\n?\s*compareHtg > product\.priceHTG && \(/);
  assert.match(fiche, /pourcentageRabais\(compareHtg, product\.priceHTG\)/);
  const vendre = readFileSync("app/vendre/page.tsx", "utf8");
  assert.match(vendre, /<RabaisManager[\s>]/);
  const manager = readFileSync("components/rabais-manager.tsx", "utf8");
  // Le vendeur ne saisit que le NOUVEAU prix — aucun champ « ancien prix ».
  assert.match(manager, /newPriceHTG: v/);
  assert.ok(!/compareHTG:|ancienHTG:/.test(manager), "pas de saisie du barré côté client");
});
