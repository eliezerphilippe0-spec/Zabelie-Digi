import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * UN TITRE DE SECTION, UN SEUL STYLE — audit typographique du 2026-09-26, UI-02.
 *
 * Mesuré avant (styles calculés, tableau de bord à 390 px) : dix `h2` de même
 * niveau, chacun ouvrant une carte de section, en QUATRE styles —
 *
 *   « Pèfòmans pwodui dijital yo »              20 px · 700
 *   « Boutik ou louvri »                        20 px · 600
 *   « Boutik mwen », « Mes produits »…          18 px · 600
 *   « Verifikasyon idantite w », « Livrezon »    14 px · 600
 *
 * — les deux derniers au rendu EXACT d'un libellé de bouton (« Enregistrer » :
 * 14 px · 600). Aucun n'était faux isolément : chaque composant avait choisi
 * sa taille. C'est le cumul qui cassait la hiérarchie, et un cumul ne se voit
 * dans aucun fichier.
 *
 * Désormais chaque `h2` de ces fichiers porte `.titre-section`
 * (`app/globals.css`) et RIEN d'autre en taille ou en graisse — une classe
 * `text-*` ou `font-*` posée à côté la contredirait sans que personne le voie.
 */

/** Les fichiers dont les `h2` ouvrent une carte de section du tableau de bord.
 *  `seller-pricing-panel` sert aussi `/vendre` : ses titres y suivent. */
const FICHIERS = [
  "app/tableau-de-bord/page.tsx",
  "components/seller-pricing-panel.tsx",
  "components/vendeur-premier-pas.tsx",
  "components/digital-seller-metrics.tsx",
  "components/kyc-form.tsx",
  "components/delivery-info-form.tsx",
];

const TAILLE = /\btext-(xs|sm|base|lg|xl|[2-9]xl|\[[^\]]+\])\b/;
const GRAISSE = /\bfont-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black)\b/;

test("T1 — chaque h2 des cartes de section porte `titre-section`, sans taille ni graisse à côté", () => {
  const fautes: string[] = [];
  let vus = 0;
  for (const f of FICHIERS) {
    const src = readFileSync(f, "utf8");
    for (const m of src.matchAll(/<h2\b([^>]*)>/g)) {
      vus++;
      const ligne = src.slice(0, m.index).split("\n").length;
      const classes = /className="([^"]*)"/.exec(m[1])?.[1];
      if (classes === undefined) fautes.push(`${f}:${ligne} — h2 sans className littéral`);
      else if (!/\btitre-section\b/.test(classes)) fautes.push(`${f}:${ligne} — « ${classes} » sans titre-section`);
      else if (TAILLE.test(classes) || GRAISSE.test(classes)) fautes.push(`${f}:${ligne} — « ${classes} » contredit titre-section`);
    }
  }
  // Un balayage qui ne voit rien réussit toujours : le nombre est le témoin.
  assert.ok(vus >= 12, `seulement ${vus} h2 lus dans ${FICHIERS.length} fichiers — le motif ne voit plus les titres`);
  assert.deepEqual(fautes, [], "Titre(s) de section hors du style unique :\n  " + fautes.join("\n  "));
});

test("T2 — `.titre-section` fixe la taille de l'échelle ET repose la graisse 700", () => {
  const css = readFileSync("app/globals.css", "utf8");
  const bloc = /\.titre-section\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
  assert.match(bloc, /font-size:\s*var\(--text-lg/, "la taille doit venir de l'échelle (text-lg), pas d'une valeur libre");
  assert.match(bloc, /font-weight:\s*700/, "la graisse 700 de la règle `h1…h6` doit être reposée : c'est elle que les `font-semibold` écrasaient");
});
