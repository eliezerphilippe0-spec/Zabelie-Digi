import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { idDeFragment } from "../components/ancre-au-chargement";

/**
 * LES ANCRES ARRIVENT SOUS L'EN-TÊTE REPLIÉ — mesuré le 2026-10-19 à 360 × 800.
 *
 * Avant correction, dans un vrai Chromium (`e2e/parcours-physique-ancres`) :
 *   - lien du tableau de bord vers `/vendre#mes-produits` : section à 2 px
 *     du haut, sous l'en-tête de 108 px — le pli (202 → 108 px) avait remonté
 *     la page de 94 px après le saut ;
 *   - même saut depuis /vendre : 96 px, `scroll-mt-24` trop court de 12 px ;
 *   - chargement complet de `/vendre#mes-produits` : scrollY = 0, le
 *     squelette de `app/loading.tsx` passe avant le contenu.
 *
 * Ce fichier garde les trois causes ; le parcours e2e garde le résultat.
 */

const ENTETE_REPLIE_PX = 108; // 360 px : raccourcis + recherche
const MARGE_MIN = 32; // scroll-mt-32 = 8rem = 128 px : 20 px sous l'en-tête replié

test("le pli rend sa hauteur en marge : la page ne bouge pas quand l'en-tête se replie", () => {
  const shell = readFileSync("components/header-shell.tsx", "utf8");
  assert.match(shell, /reserve = compact \? Math\.max\(0, avant - el\.offsetHeight\) : 0;/, "la hauteur perdue au pli doit être mesurée");
  assert.match(shell, /el\.style\.marginBottom = reserve \? `\$\{reserve\}px` : "";/, "la hauteur perdue doit être rendue en marge");
  /* Sans ce seuil, la réserve apparaîtrait sous l'en-tête replié en remontant. */
  assert.match(shell, /const depli = Math\.min\(Math\.max\(reserve, DEPLI_MIN\), DEPLI_MAX\);/);
  assert.match(shell, /const suivant = compact \? y > depli : y > SEUIL_PLI;/);
});

test(`aucune ancre ne finit sous l'en-tête replié (scroll-mt ≥ ${MARGE_MIN}, soit ${MARGE_MIN * 4} px > ${ENTETE_REPLIE_PX})`, () => {
  const fautifs: string[] = [];
  const parcourir = (dossier: string) => {
    for (const entree of readdirSync(dossier, { withFileTypes: true })) {
      const chemin = join(dossier, entree.name);
      if (entree.isDirectory()) parcourir(chemin);
      else if (/\.tsx?$/.test(entree.name)) {
        for (const m of readFileSync(chemin, "utf8").matchAll(/\bscroll-mt-(\d+)\b/g)) {
          if (Number(m[1]) < MARGE_MIN) fautifs.push(`${chemin}: ${m[0]}`);
        }
      }
    }
  };
  parcourir("app");
  parcourir("components");
  assert.deepEqual(fautifs, [], "ces ancres finissent sous l'en-tête replié");
});

test("le fragment est rattrapé au chargement complet, sur toutes les pages", () => {
  const layout = readFileSync("app/layout.tsx", "utf8");
  assert.match(layout, /import \{ AncreAuChargement \} from "@\/components\/ancre-au-chargement";/);
  assert.match(layout, /<AncreAuChargement \/>/, "le layout racine doit monter AncreAuChargement");
  const composant = readFileSync("components/ancre-au-chargement.tsx", "utf8");
  /* `scrollIntoView` respecte scroll-margin ; aucun `behavior` forcé : le
   * glissé suit `scroll-behavior`, donc le mouvement réduit. */
  assert.match(composant, /cible\.scrollIntoView\(\{ block: "start" \}\);/);
  assert.match(composant, /!el\.closest\("\[hidden\]"\)/, "le contenu encore rangé dans le <div hidden> du flux n'est pas une cible");
  assert.match(composant, /nav\.type !== "navigate"/, "rechargement et retour arrière : la position restaurée prime");
});

test("idDeFragment ne retient que ce qui peut nommer un élément", () => {
  assert.equal(idDeFragment("#mes-produits"), "mes-produits");
  assert.equal(idDeFragment("#produit-6f1c2a40-0d4e-4c55-9a3b-1b2c3d4e5f60"), "produit-6f1c2a40-0d4e-4c55-9a3b-1b2c3d4e5f60");
  assert.equal(idDeFragment("#lecon_12"), "lecon_12");
  assert.equal(idDeFragment(""), null);
  assert.equal(idDeFragment("#"), null);
  assert.equal(idDeFragment("#access_token=abc&type=recovery"), null, "les jetons d'auth ne sont pas une ancre");
  assert.equal(idDeFragment("#%E0%A4%A"), null, "fragment mal encodé");
});

test("le glissé des ancres respecte le mouvement réduit", () => {
  const css = readFileSync("app/globals.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const garde = /@media \(prefers-reduced-motion: no-preference\) \{\s*html \{\s*scroll-behavior: smooth;/;
  assert.match(css, garde, "le glissé doit vivre dans un bloc `no-preference`");
  assert.doesNotMatch(css.replace(garde, ""), /scroll-behavior: smooth/, "un `scroll-behavior: smooth` sans condition est revenu");
});
