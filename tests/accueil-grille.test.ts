import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * LA BANNIÈRE DE LANCEMENT PART DE LA GRILLE.
 *
 * Mesuré au rendu sur zabelie.com le 2026-09-29 (Chromium), position
 * horizontale du texte :
 *
 *   bloc                                   à 390   à 768   à 1 440
 *   bandeau des paiements, titres            12      12      156
 *   bannière de lancement (kicker, h1)       20      36      180
 *
 * La bannière de lancement (`.launch-hero`) n'a ni fond ni bordure, mais
 * gardait le retrait horizontal d'une carte : 24 px, 8 px sur mobile. Elle n'a
 * pas de bord à respecter — son texte doit partir de la même ligne que les
 * autres blocs. La gouttière elle-même est gardée par
 * `tests/gouttiere-unique.test.ts`.
 *
 * L'assertion porte sur ce qui COMMANDE la position — la déclaration
 * `padding` de la règle qui l'emporte — jamais sur un libellé.
 *
 * ⚠️ CE QU'IL NE PROUVE PAS : qu'un enfant ne se décale pas par sa propre
 * marge. Seule une mesure au rendu le voit — captures avant/après de la PR.
 */

const css = readFileSync("app/editorial-marketplace.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

/** Le corps d'un bloc `@media …`, accolades équilibrées. */
function blocMedia(requete: string): string {
  const i = css.indexOf(requete);
  assert.ok(i >= 0, `la requête « ${requete} » a disparu de editorial-marketplace.css`);
  let j = css.indexOf("{", i) + 1;
  const debut = j;
  for (let prof = 1; prof > 0; j++) prof += css[j] === "{" ? 1 : css[j] === "}" ? -1 : 0;
  return css.slice(debut, j - 1);
}

/** Les règles qui visent la bannière ELLE-MÊME (pas ses enfants) et posent un retrait. */
function reglesBanniere(source: string): Array<{ selecteur: string; corps: string }> {
  const regles: Array<{ selecteur: string; corps: string }> = [];
  for (const m of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selecteur = m[1].trim();
    if (!/\.launch-hero$/.test(selecteur)) continue;
    if (!/padding/.test(m[2])) continue;
    regles.push({ selecteur, corps: m[2] });
  }
  return regles;
}

/** Retraits gauche et droit d'une règle, raccourci `padding` compris (1 à 4 valeurs). */
function retraitsHorizontaux(corps: string): string[] {
  const valeurs: string[] = [];
  const court = corps.match(/(?:^|;)\s*padding\s*:\s*([^;]+)/);
  if (court) {
    // 1 valeur : partout · 2 : vertical, horizontal · 3 : haut, horizontal,
    // bas · 4 : haut, droite, bas, gauche.
    const v = court[1].trim().split(/\s+/);
    const droite = v[1] ?? v[0];
    const gauche = v[3] ?? droite;
    valeurs.push(droite, gauche);
  }
  for (const m of corps.matchAll(/padding-(?:inline(?:-start|-end)?|left|right)\s*:\s*([^;]+)/g)) {
    valeurs.push(...m[1].trim().split(/\s+/));
  }
  return valeurs;
}

test("G1 — la bannière de lancement n'a AUCUN retrait horizontal, sur ordinateur comme sur mobile", () => {
  const toutes = reglesBanniere(css);
  const mobile = reglesBanniere(blocMedia("@media (max-width:767px)"));
  // Non-vacuité : une règle ordinateur, une règle mobile. Zéro règle trouvée
  // rendrait le test vert sans rien regarder.
  assert.equal(toutes.length, 2, `attendu 2 règles de retrait pour .launch-hero, vu ${toutes.length}`);
  assert.equal(mobile.length, 1, "la règle mobile de la bannière doit vivre dans la requête ≤ 767 px");
  for (const { selecteur, corps } of toutes) {
    // La spécificité compte : c'est ce sélecteur qui l'emporte sur le
    // `.home-discovery .home-hero { padding: 40px }` de home-discovery.css.
    assert.equal(selecteur, ".home-discovery.editorial-page .launch-hero", `sélecteur inattendu : ${selecteur}`);
    const retraits = retraitsHorizontaux(corps);
    assert.ok(retraits.length >= 2, `aucun retrait horizontal lisible dans « ${corps.trim()} »`);
    for (const r of retraits) assert.match(r, /^0(?:px)?$/, `retrait horizontal ${r} : la bannière sort de la grille`);
  }
});
