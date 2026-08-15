import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * Coordonnées de livraison (V-5, docs/35) — le cœur est la RLS de 0076,
 * testée en SQL (L1-L3, CI). Ici : les invariants d'architecture que la
 * revue de code doit pouvoir tenir sans relire toute la pile.
 */

test("0076 : l'adresse ne vit PAS sur profiles (lecture publique) — table dédiée, 4 policies", () => {
  const sql = readFileSync("supabase/migrations/0076_delivery_info.sql", "utf8");
  assert.match(sql, /create table zabelie_delivery_info/);
  assert.ok(
    !/alter table profiles add column/.test(sql),
    "une adresse sur profiles serait publique"
  );
  // La règle porteur encodée en policy : commande PAYÉE, et rien d'autre.
  assert.match(sql, /o\.status = 'paid'/);
  assert.match(sql, /p\.seller_id = auth\.uid\(\)/);
});

test("route delivery-info : client de SESSION — jamais service-role (la RLS est le garde)", () => {
  const src = readFileSync("app/api/delivery-info/route.ts", "utf8");
  assert.ok(!/createAdminClient/.test(src), "le service-role contournerait la RLS 0076");
  assert.match(src, /\.upsert\(\{[\s\S]{0,80}user_id: user\.id/);
  assert.match(src, /isMissingTable\(error\)[\s\S]{0,300}status: 503/);
});

test("mes-ventes : lecture des coordonnées via le client de SESSION, jamais l'admin", () => {
  const src = readFileSync("app/mes-ventes/page.tsx", "utf8");
  assert.match(src, /from\("zabelie_delivery_info"\)/);
  assert.ok(
    !/createAdminClient/.test(src),
    "mes-ventes doit laisser la policy seller_read décider"
  );
  // Le bloc n'apparaît qu'au moment d'expédier.
  assert.match(src, /v\.status === "awaiting_shipment" &&[\s\S]{0,200}livParAcheteur/);
});

test("tableau de bord : le formulaire est masqué tant que 0076 n'est pas appliquée", () => {
  const src = readFileSync("app/tableau-de-bord/page.tsx", "utf8");
  assert.match(src, /\{livInfo !== undefined && \(/);
  assert.match(src, /isMissingTable\(livErr\)/);
});

test("la politique de confidentialité décrit la collecte, dans les quatre langues", () => {
  const src = readFileSync("lib/policy-privacy.ts", "utf8");
  for (const marqueur of [
    "adresse de livraison",
    "adrès livrezon",
    "delivery address",
    "dirección de entrega",
  ]) {
    assert.ok(src.includes(marqueur), `politique : « ${marqueur} » absent`);
  }
});
