import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * BADGE « IDENTITÉ VÉRIFIÉE » — 0138 (décision porteur du 2026-10-14, audit
 * `docs/69`, lot 2). Le comportement en base est éprouvé sous `anon` par
 * `supabase/tests/identite_verifiee.test.sql` ; ici, le côté application.
 *
 *  B1  fail-closed : sur erreur, aucun badge (jamais un badge inventé) ;
 *  B2  la fiche produit n'affiche le badge que pour son vendeur approuvé ;
 *  B3  la boutique aussi, avec l'aide en clair ;
 *  B4  couleurs neutres : ni l'orange des actions, ni le vert des paiements ;
 *  B5  quatre langues, et l'aide dit ce que le badge n'est PAS ;
 *  B6  la fonction filtre approuvé, marchand et non suspendu.
 *
 * Chaque garde a été rougie par une mutation avant d'être crue (PR du lot 2).
 */

const RACINE = join(import.meta.dirname, "..");
const lire = (p: string) => readFileSync(join(RACINE, p), "utf8");
const sansCommentairesTs = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

test("B1 — fail-closed : sur erreur, aucun badge", () => {
  const lib = sansCommentairesTs(lire("lib/identite-verifiee.ts"));
  assert.match(lib, /supabase\.rpc\("zabelie_identites_verifiees", \{ p_ids: uniques \}\)/);
  assert.match(lib, /if \(error \|\| !Array\.isArray\(data\)\) \{\s*console\.warn\([^;]+;\s*return new Set\(\);\s*\}/);
  assert.match(lib, /\} catch \{\s*console\.warn\([^;]+;\s*return new Set\(\);\s*\}/);
});

test("B2 — la fiche n'affiche le badge que pour SON vendeur approuvé", () => {
  const page = sansCommentairesTs(lire("app/produit/[slug]/page.tsx"));
  assert.match(page, /const identiteVerifiee = product\.creatorId \? \(await identitesVerifiees\(\[product\.creatorId\]\)\)\.has\(product\.creatorId\) : false;/);
  assert.match(page, /\{identiteVerifiee && \(\s*<BadgeIdentite label=\{t\(lang, "seller\.identite\.badge"\)\} aide=\{t\(lang, "seller\.identite\.aide"\)\} \/>/);
});

test("B3 — la boutique aussi, avec l'aide en clair", () => {
  const vue = sansCommentairesTs(lire("components/boutique-vue.tsx"));
  assert.match(vue, /const identiteVerifiee = \(await identitesVerifiees\(\[creator\.id\]\)\)\.has\(creator\.id\);/);
  assert.match(vue, /\{identiteVerifiee && \(\s*<div[^>]*>\s*<BadgeIdentite label=\{t\(lang, "seller\.identite\.badge"\)\} aide=\{t\(lang, "seller\.identite\.aide"\)\} \/>\s*<p[^>]*>\{t\(lang, "seller\.identite\.aide"\)\}<\/p>/);
});

test("B4 — couleurs neutres", () => {
  const badge = lire("components/badge-identite.tsx");
  const classes = /className="([^"]+)"/.exec(badge)?.[1] ?? "";
  assert.ok(classes.length > 0, "classes du badge introuvables");
  assert.doesNotMatch(classes, /\b(bg|text|border)-(brand|accent|success|warning|danger)/, `couleur réservée dans le badge : ${classes}`);
});

test("B5 — quatre langues ; l'aide dit ce que le badge n'est pas", () => {
  const i18n = lire("lib/i18n.ts");
  assert.equal((i18n.match(/^\s*"seller\.identite\.badge": /gm) ?? []).length, 4);
  const aides = [...i18n.matchAll(/^\s*"seller\.identite\.aide": "([^"]+)",$/gm)].map((m) => m[1]);
  assert.equal(aides.length, 4);
  const negations = [/pas une garantie/, /pa vle di Zabelie garanti/, /not a guarantee/, /No es una garantía/];
  negations.forEach((re, i) => assert.match(aides[i], re, `aide ${i} sans la négation`));
});

test("B6 — la fonction filtre approuvé, marchand, non suspendu", () => {
  const m = lire("supabase/migrations/0138_zabelie_identite_verifiee.sql").replace(/--.*$/gm, "");
  assert.match(m, /where k\.user_id = any \(p_ids\[1:100\]\)\s*and k\.status = 'approved'\s*and p\.suspended_at is null\s*and \(p\.role = 'creator' or exists \(select 1 from products pr where pr\.seller_id = p\.id\)\);/);
});
