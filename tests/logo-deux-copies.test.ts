import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * LE MÊME LOGO EXISTE DEUX FOIS, ET LES DEUX COPIES AVAIENT DÉJÀ DIVERGÉ.
 *
 * `components/brand-logo.tsx` dessine le monogramme avec les variables CSS du
 * thème. `app/icon.svg` le redessine en hex, parce qu'un favicon est chargé
 * hors du DOM : `var(--color-ink)` n'y résout pas. Deux copies, une seule
 * source de vérité, et un commentaire « garder en phase » pour tout garde-fou.
 *
 * Ça n'a pas tenu. Au 2026-08-11 le favicon peignait le Z en `#17123a` — une
 * encre qui n'existe plus nulle part dans `zabelie-theme.css`, où
 * `--color-ink` vaut `#0a0a0a` — donc l'onglet du navigateur montrait un
 * logo que l'en-tête ne montrait plus. Personne ne l'a vu : un favicon est
 * regardé à 16 px, et une divergence de teinte à 16 px ne se voit pas.
 *
 * C'est le motif du dépôt, encore : le défaut ne lève rien, ne ralentit rien,
 * et sa seule manifestation est une différence que l'œil ne peut pas mesurer.
 * Seul un croisement mécanique le rend visible.
 *
 * Ce que le contrôle croise :
 *   le tracé `d` du Z + les couleurs de `components/brand-logo.tsx`
 *     × les mêmes valeurs dans `app/icon.svg`, résolues via `zabelie-theme.css`
 */

const TSX = readFileSync("components/brand-logo.tsx", "utf8");
const SVG = readFileSync("app/icon.svg", "utf8");
const CSS = readFileSync("app/zabelie-theme.css", "utf8");

/** Valeur d'un token du thème, en hex minuscule. */
function token(nom: string): string {
  const m = new RegExp(`--color-${nom}:\\s*(#[0-9a-fA-F]{3,8})`).exec(CSS);
  assert.ok(m, `token --color-${nom} introuvable dans app/zabelie-theme.css`);
  return m![1].toLowerCase();
}

/** Le premier attribut `d=` d'un fichier — le tracé du Z. */
function trace(src: string, quoi: string): string {
  const m = /\sd="([^"]+)"/.exec(src);
  assert.ok(m, `aucun tracé \`d=\` dans ${quoi}`);
  return m![1].replace(/\s+/g, " ").trim();
}

test("le tracé du Z est identique dans le composant et dans le favicon", () => {
  assert.equal(
    trace(SVG, "app/icon.svg"),
    trace(TSX, "components/brand-logo.tsx"),
    "Le monogramme a été redessiné d'un côté seulement. Les deux copies " +
      "doivent porter le MÊME `d` — l'onglet du navigateur et l'en-tête " +
      "montrent le même logo ou ils mentent l'un sur l'autre."
  );
});

test("le favicon peint le Z avec la valeur réelle de --color-brand", () => {
  const brand = token("brand");
  assert.match(
    TSX,
    /d="[^"]+"\s+fill="var\(--color-brand\)"/,
    "Le composant doit peindre le Z avec `var(--color-brand)` — la couleur du " +
      "bouton « Rechercher » (demande porteur 2026-08-11)."
  );
  assert.ok(
    SVG.toLowerCase().includes(`fill="${brand}"`),
    `Le favicon doit peindre le Z en ${brand} (= --color-brand). ` +
      `Le hex du favicon ne suit PAS le thème : quand le token bouge, cette ` +
      `copie reste en arrière, et c'est exactement ce qui est arrivé.`
  );
});

test("le favicon pose la tuile avec la valeur réelle de --color-ink", () => {
  const ink = token("ink");
  assert.ok(
    SVG.toLowerCase().includes(`fill="${ink}"`),
    `La tuile du favicon doit valoir ${ink} (= --color-ink). Valeur trouvée : ` +
      `${(/fill="(#[0-9a-fA-F]+)"/.exec(SVG) ?? [, "aucune"])[1]}.`
  );
  assert.match(
    TSX,
    /fill="var\(--color-ink\)"/,
    "La tuile du composant doit venir du token, pas d'un hex."
  );
});

test("aucun hex écrit en dur ne traîne dans le composant", () => {
  // Le composant vit DANS le DOM : il n'a aucune excuse pour figer une
  // couleur. Seul le favicon en a une, et c'est pourquoi il est croisé.
  const hex = TSX.match(/#[0-9a-fA-F]{6}\b/g) ?? [];
  const horsCommentaires = hex.filter((h) => {
    const i = TSX.indexOf(h);
    const avant = TSX.lastIndexOf("*", i);
    const ouvrant = TSX.lastIndexOf("/**", i);
    const fermant = TSX.lastIndexOf("*/", i);
    return !(ouvrant > fermant && avant > ouvrant);
  });
  assert.deepEqual(
    horsCommentaires,
    [],
    `Hex en dur hors commentaire dans brand-logo.tsx : ${horsCommentaires.join(", ")}`
  );
});
