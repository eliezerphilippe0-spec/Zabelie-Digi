import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { DICT, LANGS } from "@/lib/i18n";
import { NOMS_LANGUES } from "@/lib/noms-langues";

/**
 * FINITIONS DE L'AUDIT PAGE PAR PAGE DU 2026-10-17.
 *
 * Mesurées sur zabelie.com, 66 pages, en 360 px : des pages privées
 * indexables, un panier qui parle « d'achats », des codes de langue de 17 px
 * de large, des liens de 24 px de haut. Rien de cassé, tout ce qui sépare une
 * page correcte d'une page finie. Chaque garde ci-dessous échoue si l'on
 * retire sa correction.
 */

const lire = (f: string) => readFileSync(f, "utf8");

test("F1 — les pages privées portent noindex, comme mes-achats et favoris", () => {
  /* `robots.txt` interdit l'exploration, pas l'indexation : une URL interdite
   * qu'un lien externe cite peut sortir dans Google, sans description. Seul
   * `noindex` l'en retire. */
  for (const f of [
    "app/panier/page.tsx",
    "app/reinitialiser-mot-de-passe/page.tsx",
    "app/tableau-de-bord/page.tsx",
    "app/mes-ventes/page.tsx",
    "app/mes-achats/page.tsx",
    "app/favoris/page.tsx",
  ]) {
    /* Deux formes, AUSSI strictes l'une que l'autre : l'objet statique, ou
     * l'objet RENDU par `generateMetadata` (titre traduit — /mes-achats
     * et /tableau-de-bord depuis le 2026-10-27). Next interdit les deux exports ensemble ; la
     * seconde est lue dans le `return` de la fonction, pas n'importe où. */
    const src = lire(f);
    const statique = /export const metadata = \{[^}]*robots: \{ index: false, follow: false \} \};/.test(src);
    const corps = src.match(/export async function generateMetadata\(\)[^{]*\{([\s\S]*?)\n\}/)?.[1] ?? "";
    const rendu = /return \{[^;]*robots: \{ index: false, follow: false \}[^;]*\};/.test(corps);
    assert.ok(statique || rendu, `${f} peut être indexée`);
  }
});

test("F2 — le panier non connecté parle du panier, dans les quatre langues", () => {
  const src = lire("app/panier/page.tsx");
  assert.match(src, /t\(lang, "cart\.login\.b"\)/, "le panier ne rend plus sa propre phrase de connexion");
  assert.doesNotMatch(src, /"purchases\.login\.b"/, "le panier reparle « d'achats »");
  const PANIER: Record<string, RegExp> = { fr: /panier/i, ht: /panyen/i, en: /cart/i, es: /carrito/i };
  for (const lang of LANGS) {
    const p = (DICT[lang] as Record<string, string>)["cart.login.b"];
    assert.ok(p?.trim(), `cart.login.b manquante en ${lang}`);
    assert.match(p, PANIER[lang], `cart.login.b (${lang}) ne parle pas du panier : « ${p} »`);
  }
});

test("F3 — le sélecteur des guides nomme les langues, d'une seule source", () => {
  const guide = lire("app/guides/[lang]/[slug]/page.tsx");
  assert.match(guide, /\{NOMS_LANGUES\[l\]\}<\/Link>/, "les guides affichent de nouveau un code (FR, HT…) au lieu du nom");
  assert.doesNotMatch(guide, /\{l\.toUpperCase\(\)\}/, "un code de langue de 17 px de large est revenu");
  /* L'en-tête et les guides lisent la même table : « KR » d'un côté et « HT »
   * de l'autre était le défaut. */
  const toggle = lire("components/lang-toggle.tsx");
  assert.match(toggle, /const NOM = NOMS_LANGUES;/, "le sélecteur de l'en-tête a repris sa propre table de noms");
  for (const lang of LANGS) assert.ok(NOMS_LANGUES[lang].length >= 6, `nom trop court pour ${lang}`);
});

test("F4 — les liens du contrat d'API font 44 px de haut", () => {
  const src = lire("app/developpeurs/page.tsx");
  for (const lien of ["/api/v1/openapi.json", "/api/v1/seller/openapi.json"]) {
    const i = src.indexOf(lien);
    assert.ok(i > -1, `${lien} introuvable`);
    const balise = src.slice(i, src.indexOf(">", i));
    assert.match(balise, /min-h-11/, `le lien ${lien} n'a plus sa hauteur tactile`);
  }
});

test("F5 — le champ prix du calculateur offre 44 px au doigt sans décaler la phrase", () => {
  const css = lire("app/ouvrir-ma-boutique/etal.css");
  const i = css.indexOf(".page-etal .etal-calcul-prix input {");
  const regle = css.slice(i, css.indexOf("}", i));
  assert.match(regle, /min-height: 44px;/, "le champ retombe à 34 px de haut en 360 px");
  /* Le remplissage et la marge négative vont ensemble : l'un sans l'autre
   * déplace la ligne ou rend la zone inutile. */
  const haut = regle.match(/padding-top: (\d+)px;/)?.[1];
  const marge = regle.match(/margin-top: -(\d+)px;/)?.[1];
  assert.ok(haut && marge && haut === marge, "remplissage haut et marge négative ne se compensent plus");
});
