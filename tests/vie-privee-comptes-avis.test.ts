import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * VIE PRIVÉE DES COMPTES ET DES AVIS — 0137 (audit `docs/69`, lot 1 bis).
 * Le comportement en base est éprouvé sous les rôles réels par
 * `supabase/tests/vie_privee_comptes_avis.test.sql` ; ce fichier garde le
 * côté APPLICATION et la non-régression du dépôt.
 *
 *  P1  la lecture publique totale des profils ne revient pas : 0137 la retire,
 *      et aucune migration ultérieure ne la recrée ;
 *  P2  les avis publics passent par `zabelie_avis_produit`, sans jointure
 *      vers `profiles` ;
 *  P3  « mes avis » est lu côté serveur, BORNÉ à l'acheteur de la session ;
 *  P4  le nom de repli est traduit par l'écran, jamais écrit en dur.
 *
 * Chaque garde a été rougie par une mutation avant d'être crue (PR du lot 1 bis).
 */

const RACINE = join(import.meta.dirname, "..");
const lire = (p: string) => readFileSync(join(RACINE, p), "utf8");
const sansCommentairesTs = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const sansCommentairesSql = (s: string) => s.replace(/--.*$/gm, "");

test("P1 — la lecture publique totale des profils ne revient pas", () => {
  const m = sansCommentairesSql(lire("supabase/migrations/0137_zabelie_vie_privee_comptes_avis.sql"));
  assert.match(m, /drop policy if exists "profiles_public_read" on profiles;/);
  assert.match(m, /create policy "profiles_lecture_restreinte"\s+on profiles for select\s+using \(zabelie_profil_lisible\(id\)\);/);
  // Aucune migration postérieure ne recrée une lecture ouverte.
  const ulterieures = readdirSync(join(RACINE, "supabase/migrations"))
    .filter((f) => /^\d{4}_.*\.sql$/.test(f) && Number(f.slice(0, 4)) > 137);
  for (const f of ulterieures) {
    const src = sansCommentairesSql(lire(`supabase/migrations/${f}`));
    assert.doesNotMatch(src, /create policy "?profiles_public_read"?/, `${f} recrée profiles_public_read`);
    assert.doesNotMatch(src, /on profiles\s+for select\s+using \(\s*true\s*\)/, `${f} rouvre profiles à tous`);
  }
});

test("P2 — les avis publics passent par la fonction, sans jointure vers profiles", () => {
  const r = sansCommentairesTs(lire("lib/reviews.ts"));
  assert.match(r, /supabase\.rpc\("zabelie_avis_produit",\s*\{\s*p_product_id: productId,/);
  assert.doesNotMatch(r, /profiles\s*\(/, "une jointure vers profiles exposerait le nom complet (et casse sous 0137)");
  assert.match(r, /buyerName: r\.auteur,/);
});

test("P3 — « mes avis » : clé de service, bornée à l'acheteur de la session", () => {
  const r = sansCommentairesTs(lire("lib/reviews.ts"));
  assert.match(
    r,
    /if \(!user\) return new Set\(\);[\s\S]{0,120}const admin = createAdminClient\(\);\s*const \{ data \} = await admin\s*\.from\("product_reviews"\)\s*\.select\("order_id"\)\s*\.eq\("buyer_id", user\.id\)\s*\.in\("order_id", orderIds\);/,
  );
});

test("P4 — le nom de repli est traduit, dans les quatre langues", () => {
  const page = sansCommentairesTs(lire("app/produit/[slug]/page.tsx"));
  assert.match(page, /\{r\.buyerName \?\? t\(lang, "product\.reviews\.auteur"\)\}/);
  assert.equal((lire("lib/i18n.ts").match(/^\s*"product\.reviews\.auteur": /gm) ?? []).length, 4);
  assert.doesNotMatch(sansCommentairesTs(lire("lib/reviews.ts")), /"Acheteur"/);
});
