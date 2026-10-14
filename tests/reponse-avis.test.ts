import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * RÉPONSE DU VENDEUR AUX AVIS — 0139 (choix porteur du 2026-10-14, audit
 * `docs/69`, lot 2). Le comportement en base est éprouvé sous les rôles réels
 * par `supabase/tests/avis_reponse.test.sql` ; ici, le côté application.
 *
 *  R1  la route appelle la fonction avec le client de SESSION (auth.uid()),
 *      la clé de service ne sert qu'au plafond de débit ;
 *  R2  bornes identiques partout : 1 000 caractères en base, route, formulaire ;
 *  R3  « déjà répondu » (23505) devient 409, et le formulaire le dit ;
 *  R4  la fiche n'offre le formulaire qu'au vendeur, sous un avis sans réponse ;
 *      la réponse est rendue en texte, jamais en HTML ;
 *  R5  la lecture des avis porte la réponse jusqu'à l'écran ;
 *  R6  neuf libellés, quatre langues ;
 *  R7  la fonction : vendeur du produit, compte actif, une seule fois,
 *      exécutable par `authenticated` seulement.
 *
 * Chaque garde a été rougie par une mutation avant d'être crue (PR du lot 2).
 */

const RACINE = join(import.meta.dirname, "..");
const lire = (p: string) => readFileSync(join(RACINE, p), "utf8");
const sansCommentairesTs = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const MIGRATION = "supabase/migrations/0139_zabelie_reponse_vendeur_avis.sql";

test("R1 — client de session pour la fonction, clé de service pour le débit seulement", () => {
  const route = sansCommentairesTs(lire("app/api/reviews/reponse/route.ts"));
  assert.match(route, /const supabase = await createClient\(\);/);
  assert.match(route, /await supabase\.rpc\("zabelie_repondre_avis", \{/);
  const usagesAdmin = route.match(/createAdminClient\(\)/g) ?? [];
  assert.equal(usagesAdmin.length, 1, "la clé de service ne doit servir qu'une fois");
  assert.match(route, /rateLimit\(createAdminClient\(\), `avis:reponse:\$\{user\.id\}`, \d+, \d+\)/);
  assert.match(route, /if \(!user\) \{\s*return erreurAvecLangue\(lang, "api\.auth\.required", 401\);/);
});

test("R2 — 1 000 caractères en base, dans la route et dans le formulaire", () => {
  const route = sansCommentairesTs(lire("app/api/reviews/reponse/route.ts"));
  assert.match(route, /const REPONSE_MAX = 1000;/);
  assert.match(route, /if \(!UUID_RE\.test\(reviewId\) \|\| texte\.length < 1 \|\| texte\.length > REPONSE_MAX\) \{/);
  assert.match(lire("components/reponse-avis-form.tsx"), /maxLength=\{1000\}/);
  const m = lire(MIGRATION).replace(/--.*$/gm, "");
  assert.match(m, /if char_length\(v_texte\) < 1 or char_length\(v_texte\) > 1000 then/);
  assert.match(m, /char_length\(btrim\(reponse_vendeur\)\) between 1 and 1000/);
});

test("R3 — « déjà répondu » : 23505 → 409, affiché comme tel", () => {
  const route = sansCommentairesTs(lire("app/api/reviews/reponse/route.ts"));
  assert.match(route, /error\.code === "23505" \? 409 : error\.code === "42501" \? 403 : error\.code === "22023" \? 400 : 500/);
  assert.match(route, /const cle = statut === 409 \? "review\.reponse\.deja" :/);
  const form = lire("components/reponse-avis-form.tsx");
  assert.match(form, /fetch\("\/api\/reviews\/reponse"/);
  assert.match(form, /setMsg\(res\.status === 409 \? labels\.deja : labels\.erreur\);/);
});

test("R4 — formulaire au seul vendeur, sous un avis sans réponse ; texte brut", () => {
  const page = sansCommentairesTs(lire("app/produit/[slug]/page.tsx"));
  assert.match(page, /const estVendeur = visiteur\?\.id === product\.creatorId;/);
  assert.match(page, /\{r\.reponse \? \([\s\S]{0,600}?\) : \(\s*estVendeur && \(\s*<ReponseAvisForm\s+reviewId=\{r\.id\}/);
  assert.match(page, /<p className="[^"]*whitespace-pre-line[^"]*">\{r\.reponse\.texte\}<\/p>/);
  assert.doesNotMatch(page, /dangerouslySetInnerHTML=\{\{ __html: r\.reponse/);
});

test("R5 — la lecture des avis porte la réponse", () => {
  const lib = sansCommentairesTs(lire("lib/reviews.ts"));
  assert.match(lib, /\.rpc\("zabelie_avis_produit"/);
  assert.match(lib, /reponse: r\.reponse_vendeur && r\.reponse_le \? \{ texte: r\.reponse_vendeur, le: r\.reponse_le \} : null,/);
  const m = lire(MIGRATION).replace(/--.*$/gm, "");
  assert.match(m, /grant select \(reponse_vendeur, reponse_le\) on product_reviews to anon, authenticated;/);
});

test("R6 — neuf libellés, quatre langues", () => {
  const i18n = lire("lib/i18n.ts");
  for (const cle of ["titre", "cta", "placeholder", "envoyer", "annuler", "aide", "erreur", "deja", "reseau"]) {
    const n = (i18n.match(new RegExp(`^\\s*"review\\.reponse\\.${cle}": "[^"]+",$`, "gm")) ?? []).length;
    assert.equal(n, 4, `review.reponse.${cle} : ${n} langue(s) sur 4`);
  }
});

test("R7 — vendeur du produit, compte actif, une seule fois, authenticated seulement", () => {
  const m = lire(MIGRATION).replace(/--.*$/gm, "");
  assert.match(m, /v_moi\s+uuid := auth\.uid\(\);/);
  assert.match(m, /if v_vendeur is null or v_vendeur <> v_moi then/);
  assert.match(m, /if not seller_is_active\(v_vendeur\) then/);
  assert.match(m, /where id = p_review_id and reponse_vendeur is null\s+returning reponse_le into v_le;/);
  assert.match(m, /revoke all on function zabelie_repondre_avis\(uuid, text\) from public;/);
  assert.match(m, /grant execute on function zabelie_repondre_avis\(uuid, text\) to authenticated;/);
  assert.doesNotMatch(m, /grant execute on function zabelie_repondre_avis\(uuid, text\) to [^;]*anon/);
});
