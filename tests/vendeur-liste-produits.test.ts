import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DICT } from "../lib/i18n";
import { coverUrlAt, COVER_WIDTHS } from "../lib/product-image";

/**
 * LA LISTE « MES PRODUITS » DU TABLEAU DE BORD (2026-08-17).
 *
 * Elle affichait un titre et la valeur BRUTE de la base — « published »,
 * « draft » — à quelqu'un qui ne lit pas forcément l'anglais et n'a aucune
 * raison de connaître notre schéma. Et pas de photo, alors que les
 * couvertures existent depuis le pipeline d'images : un vendeur reconnaît sa
 * photo avant de lire son titre.
 */
const sansCommentaires = (src: string) =>
  src.replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const PAGE = sansCommentaires(readFileSync("app/tableau-de-bord/page.tsx", "utf8"));

// ── La vignette ────────────────────────────────────────────────────────────

test("la couverture est LUE en base — sans quoi il n'y a rien à afficher", () => {
  /* La liaison la plus facile à oublier : on peut écrire tout le rendu d'une
   * image et ne jamais demander la colonne. Le composant rendrait alors le
   * carré neutre pour tout le monde, ce qui ressemble à « aucun vendeur n'a
   * de photo » — un zéro qui n'est pas une mesure. */
  assert.match(PAGE, /\.select\("id, slug, title, status, sales_count, cover_url"\)/);
  assert.match(PAGE, /cover_url: string \| null;/, "le type doit porter la colonne");
});

test("la vignette passe par le helper de largeur, pas par l'URL brute", () => {
  /* `coverUrlAt` sait réécrire vers l'endpoint de transformation quand il est
   * activé. Poser `p.cover_url` directement servirait l'original — 2 Mo pour
   * une vignette de 48 px, sur la connexion la plus fragile du parcours.
   *
   * ⚠️ Première version : `assert.match(PAGE, /coverUrlAt\(p\.cover_url…/)`.
   * VERTE sous la mutation qui remplaçait le `src` par `p.cover_url` — parce
   * que l'appel restait présent DANS LA CONDITION du ternaire. Présence, pas
   * liaison, encore une fois. La forme corrigée exige une invocation unique,
   * nommée, et c'est ce nom qui alimente l'image. */
  const appels = PAGE.match(/coverUrlAt\(p\.cover_url, COVER_WIDTHS\.card\)/g) ?? [];
  assert.equal(appels.length, 1, "une seule invocation, sinon la liaison se dédouble");
  assert.match(PAGE, /const vignette = coverUrlAt\(p\.cover_url, COVER_WIDTHS\.card\);/);
  assert.match(PAGE, /\{vignette \? \([\s\S]{0,200}src=\{vignette\}/);
});

test("640 px pour la vignette : la MÊME largeur que la carte de catalogue", () => {
  // Deux largeurs différentes pour la même image, c'est deux entrées de cache
  // et deux téléchargements pour un vendeur qui regarde aussi son catalogue.
  assert.equal(COVER_WIDTHS.card, 640);
});

test("sans photo : un carré neutre, jamais une image cassée", () => {
  /* Un `<img src={null}>` rend une icône de fichier manquant — le vendeur
   * croit que sa photo a été perdue. Le carré dit qu'il n'y en a pas. */
  assert.match(PAGE, /\) : \(\s*\n\s*<span\s*\n\s*className="grid h-12 w-12 place-items-center/);
  assert.match(PAGE, /title="Aucune photo"/);
});

test("`coverUrlAt` rend null sur une absence — le ternaire a de quoi mordre", () => {
  // Le comportement sur lequel repose la branche ci-dessus, vérifié et non
  // supposé.
  assert.equal(coverUrlAt(null, COVER_WIDTHS.card), null);
  assert.equal(typeof coverUrlAt("https://x/y.webp", COVER_WIDTHS.card), "string");
});

// ── Le statut ──────────────────────────────────────────────────────────────

test("le statut affiché est TRADUIT, jamais la valeur de la base", () => {
  assert.ok(
    !/\{p\.sales_count\} ventes · \{p\.status\}/.test(PAGE),
    "la valeur brute de la colonne ne doit plus atteindre l'écran"
  );
  assert.match(
    PAGE,
    /p\.status === "published"\s*\n\s*\? t\(lang, "status\.published"\)\s*\n\s*: t\(lang, "status\.review"\)/
  );
});

test("tout ce qui n'est pas publié est « en revue » — décision de produit", () => {
  /* Même règle qu'`app/vendre` : un vendeur qui lisait « Brouillon » croyait
   * sa soumission échouée et resoumettait. La condition porte donc sur
   * `published`, PAS sur `draft` — sinon un statut futur (`suspended`,
   * `archived`) tomberait dans « publié » par défaut. */
  assert.ok(
    !/p\.status === "draft"/.test(PAGE),
    "tester `draft` laisserait tout statut inconnu passer pour publié"
  );
});

test("les deux libellés de statut existent dans les quatre langues", () => {
  for (const l of ["fr", "ht", "en", "es"] as const) {
    for (const k of ["status.published", "status.review"]) {
      const v = (DICT[l] as Record<string, string>)[k];
      assert.ok(typeof v === "string" && v.trim(), `${k} absente en ${l}`);
    }
  }
});

test("le compte de ventes est traduit aussi — plus de « ventes » en dur", () => {
  assert.match(PAGE, /\{p\.sales_count\} \{t\(lang, "product\.sales"\)\}/);
});
