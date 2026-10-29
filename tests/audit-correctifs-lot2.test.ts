import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PREFIXE_RESERVE, SLUGS_RESERVES, slugLibre, slugValide } from "../lib/boutik-slug";

/** Correctifs de l'audit du 2026-10-29 (docs/78), lot 2 — migration 0166 et son code. */
const lire = (f: string) => readFileSync(f, "utf8");
const MIG = lire("supabase/migrations/0166_zabelie_audit_durcissements.sql");

// ───────────── M1 — le prix flash ne vaut que pour une unité au prix validé ─────────────

test("M1 — checkout : l'offre ne s'applique qu'à une unité au prix contre lequel ZB080 l'a validée", () => {
  const src = lire("app/api/checkout/route.ts");
  // La LIAISON : `flash` n'existe que si le prix relu de la variante vaut le prix produit.
  assert.match(src, /const offreFlash = await offreFlashActive\(admin, product\.id\);\s*const flash = offreFlash && purchase\.priceHTG === product\.price_htg \* purchase\.quantity \? offreFlash : null;/);
  // Et c'est bien CETTE variable qui commande le prix payé et le bloc coupon.
  assert.match(src, /if \(flash\) \{[\s\S]{0,900}finalPriceHtg = flash\.prixFlashHtg \* purchase\.quantity;/);
  assert.match(src, /if \(!flash && typeof couponInput === "string"/);
  assert.doesNotMatch(src, /offreFlash\.prixFlashHtg/, "le prix ne se lit jamais sur l'offre brute");
});

test("M1 — la route traduit ZB166 en refus clair, sans texte de base", () => {
  const src = lire("app/api/products/flash/route.ts");
  assert.match(src, /if \(error\.code === "ZB166"\) \{\s*return erreurTraduite\("api\.flash\.variants", 422, \{ code: "variantes_multiples" \}\);/);
  assert.match(MIG, /raise exception using\s*errcode = 'ZB166'/);
  assert.match(MIG, /where product_id = new\.product_id and active;\s*if v_variants > 1 then/);
});

// ───────────── L2 — l'adresse publique ─────────────

test("L2 — slugValide : la plateforme et ses mots d'autorité sont réservés, le reste est libre", () => {
  for (const s of ["zabelie", "zabelie-officiel", "zabelie-2", "officiel", "official", "support", "assistance", "securite", "service-client"]) {
    assert.equal(slugValide(s), false, s);
  }
  for (const s of ["boutik-zabeliana", "mari-support-jakmel", "bebeto", "zabeli", "ti-zabelie"]) assert.equal(slugValide(s), true, s);
  assert.equal(slugLibre("Zabelie Officiel", new Set()), null, "aucun suffixe ne rend « zabelie-officiel-2 » acceptable");
  assert.equal(slugLibre("Support", new Set()), "support-2");
});

test("L2 — la liste de la base et celle du code sont la MÊME", () => {
  const bloc = MIG.slice(MIG.indexOf("add constraint zabelie_boutik_slug_forme"), MIG.indexOf("-- ── 4."));
  const liste = bloc.slice(bloc.indexOf("not in ("), bloc.indexOf(")", bloc.indexOf("not in (")));
  const sql = new Set([...liste.matchAll(/'([a-z0-9-]+)'/g)].map((m) => m[1]));
  assert.deepEqual([...sql].sort(), [...SLUGS_RESERVES].sort());
  assert.match(bloc, /and boutik_slug !~ '\^zabelie\(-\|\$\)'/);
  assert.equal(PREFIXE_RESERVE.source, "^zabelie(-|$)");
});

test("L2 — le trigger fige l'adresse côté client à l'INSERT comme à l'UPDATE, sans perdre un garde", () => {
  const fn = MIG.slice(MIG.indexOf("create or replace function protect_profile_privileges()"), MIG.indexOf("-- ── 3."));
  assert.match(fn, /if tg_op = 'INSERT' then[\s\S]*new\.boutik_slug\s*:= null;[\s\S]*elsif tg_op = 'UPDATE' then/);
  assert.match(fn, /elsif tg_op = 'UPDATE' then[\s\S]*new\.boutik_slug\s*:= old\.boutik_slug;/);
  for (const garde of ["new.role := old.role", "new.tier := old.tier", "new.suspended_at     := old.suspended_at", "new.created_at       := old.created_at", "new.id               := old.id"]) {
    assert.ok(fn.includes(garde), garde);
  }
  assert.match(fn, /if current_user in \(\s*'service_role', 'postgres', 'supabase_admin', 'supabase_auth_admin'\s*\) then\s*return new;/);
});

// ───────────── L10 — droits ─────────────

test("L10 — la révocation couvre les tables présentes ET à venir, et la sonde le vérifie", () => {
  assert.match(MIG, /revoke insert, update, delete, truncate on table public\.%I from anon/);
  assert.match(MIG, /revoke truncate on table public\.%I from authenticated/);
  assert.match(MIG, /alter default privileges in schema public revoke insert, update, delete, truncate on tables from anon;/);
  assert.match(MIG, /alter default privileges in schema public revoke truncate on tables from authenticated;/);
  assert.match(MIG, /has_table_privilege\('authenticated', c\.oid, 'TRUNCATE'\)\);\s*if v_n <> 0 then\s*raise exception '0166 KO/);
});
