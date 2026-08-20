import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { hrefBoutique } from "../lib/boutique-href";

/**
 * QUELLE ADRESSE ON PROPOSE (2026-08-17).
 *
 * Deux URL mènent à la même vitrine : `/boutik/<slug>`, qu'on partage, et
 * `/createur/<id>`, qui ne casse jamais. Une seule fonction décide — trois
 * ternaires recopiés (vitrine, tableau de bord, catalogue) divergeraient, et
 * la divergence ne se verrait que le jour où un vendeur aurait déjà envoyé
 * une adresse qui ne mène nulle part.
 */
const sansCommentaires = (src: string) =>
  src.replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const ID = "8f3a1c22-7b90-4d1e-9a55-0e2d7c41b8f6";

test("avec un slug valide, c'est l'adresse LISIBLE qu'on propose", () => {
  assert.equal(hrefBoutique({ id: ID, boutikSlug: "mari-jakmel" }), "/boutik/mari-jakmel");
});

test("sans slug, l'ancienne adresse — elle ne cesse jamais de fonctionner", () => {
  /* C'est le cas de tout le monde tant que `0083` n'est pas appliquée, et
   * celui, ensuite, des profils dont le nom ne laisse rien d'utilisable. */
  assert.equal(hrefBoutique({ id: ID, boutikSlug: null }), `/createur/${ID}`);
});

test("un slug ABÎMÉ ne devient jamais une URL — on retombe, on ne casse pas", () => {
  /* La colonne peut exister avant que la contrainte de forme soit posée : le
   * code se déploie seul, la migration attend un geste. Entre les deux, une
   * valeur peut être là sans être garantie. Mieux vaut une URL longue qu'une
   * URL morte déjà envoyée sur WhatsApp. */
  for (const mauvais of ["", "a", "Mari", "mari jakmel", "-mari", "mari-", "jakmèl", "admin"]) {
    assert.equal(
      hrefBoutique({ id: ID, boutikSlug: mauvais }),
      `/createur/${ID}`,
      `« ${mauvais} » ne doit pas devenir une adresse`
    );
  }
});

// ── Les trois appelants passent bien par la fonction ───────────────────────

test("la vitrine et le tableau de bord passent par `hrefBoutique`", () => {
  const CREATEUR = sansCommentaires(readFileSync("app/createur/[id]/page.tsx", "utf8"));
  const TB = sansCommentaires(readFileSync("app/tableau-de-bord/page.tsx", "utf8"));
  assert.match(CREATEUR, /partageHref=\{hrefBoutique\(creator\)\}/);
  assert.match(TB, /\$\{siteUrl\(\)\}\$\{hrefBoutique\(\{ id: user\.id, boutikSlug \}\)\}/);
  // Et plus personne ne fabrique l'URL à la main.
  assert.ok(
    !/`\/createur\/\$\{/.test(TB),
    "le tableau de bord ne doit plus composer /createur/<id> lui-même"
  );
});

test("la vue de boutique est PARTAGÉE, pas dupliquée", () => {
  /* Deux copies de 90 lignes de JSX, c'est se garantir qu'une correction
   * n'atterrira un jour que d'un côté — le dépôt en porte déjà la trace avec
   * les deux copies du logo, qui ont divergé en silence. */
  const CREATEUR = readFileSync("app/createur/[id]/page.tsx", "utf8");
  const BOUTIK = readFileSync("app/boutik/[slug]/page.tsx", "utf8");
  for (const [nom, src] of [["createur", CREATEUR], ["boutik", BOUTIK]] as const) {
    assert.match(src, /from "@\/components\/boutique-vue"/, nom);
    assert.ok(!/<ProductCard/.test(src), `${nom} ne doit pas re-rendre la grille`);
  }
});

test("`/boutik` ne consulte la base que pour une forme valide", () => {
  // Une URL retapée n'a pas à devenir une requête.
  const BOUTIK = sansCommentaires(readFileSync("app/boutik/[slug]/page.tsx", "utf8"));
  assert.match(BOUTIK, /if \(!slugValide\(slug\)\) notFound\(\);/);
});

test("l'adresse lisible est la CANONIQUE dès qu'elle existe", () => {
  /* Sans ça, les deux URL se font concurrence dans l'index des moteurs et
   * c'est l'UUID qui gagne — celle qu'on voulait précisément faire oublier. */
  const CREATEUR = sansCommentaires(readFileSync("app/createur/[id]/page.tsx", "utf8"));
  assert.match(
    CREATEUR,
    /alternates: creator\?\.boutikSlug\s*\n?\s*\? \{ canonical: `\/boutik\/\$\{creator\.boutikSlug\}` \}/
  );
});

// ── La lecture tolérante ───────────────────────────────────────────────────

test("la fonction absente ne fait pas tomber la vitrine", () => {
  /* ⚠️ CE TEST A ÉTÉ RÉÉCRIT LE 2026-08-18, ET LE POURQUOI COMPTE PLUS QUE LE
   * QUOI. Sa version précédente assertait la PRÉSENCE de
   * `.select(\`${COLONNES}, boutik_slug\`)` dans `lib/creators.ts`. Elle est
   * restée verte pendant que cette requête exacte se faisait refuser en
   * production (`42501`, colonnes hors de la liste blanche de `0015`) et que
   * `/createur/[id]` répondait 404 à tout le monde. Un test qui épingle le
   * texte d'une requête ne peut pas dire que cette requête échoue : il la
   * fige, et son vert devient une caution.
   *
   * Ce qui est vérifié ici est donc le REPLI, pas la ligne : `0084` est
   * rédigée et le code part avant elle, donc l'absence de la fonction doit
   * dégrader vers les seules colonnes que `0015` accorde — jamais rendre 500,
   * jamais rendre 404. La requête nominale, elle, est prouvée par
   * `supabase/tests/boutique_publique.test.sql`, qui l'exécute vraiment sous
   * le rôle `anon`. */
  const CREATORS = sansCommentaires(readFileSync("lib/creators.ts", "utf8"));
  assert.match(
    CREATORS,
    /PGRST202/,
    "le code de « fonction absente » doit être reconnu — sinon le repli ne se déclenche pas avant l'application de 0084",
  );
  assert.match(
    CREATORS,
    /fonctionAbsente\(error\)[\s\S]{0,400}\.select\("id, display_name, bio, avatar_url"\)/,
    "le repli ne doit lire QUE des colonnes accordées par 0015 — sinon il échoue exactement comme le chemin qu'il remplace",
  );
  assert.match(
    CREATORS,
    /if \(critere\.p_id === null\) return null;/,
    "le repli ne sait pas résoudre une adresse : filtrer sur boutik_slug est précisément ce que la liste blanche refuse",
  );
});
