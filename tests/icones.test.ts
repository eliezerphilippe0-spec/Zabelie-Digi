import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { surCheminArgent } from "./helpers/chemin-argent";

/**
 * ICÔNES : UNE FAMILLE, UN TRAIT, TROIS TAILLES — chantier design, Phase 2.6.
 *
 * Avant : 38 SVG en ligne dans 28 fichiers, trois jeux (`trust-bar`,
 * `department-icons`, `studio-icones`), sept épaisseurs de trait, et un trait
 * qui maigrissait avec l'icône. Désormais toute icône d'interface passe par
 * `components/icone.tsx` : 16, 20 ou 24 px, trait de 1,75 px D'ÉCRAN
 * (`vector-effect: non-scaling-stroke`). Ce qui reste en `<svg>` brut est une
 * illustration, une carte, un logo ou le chemin de l'argent, et c'est NOMMÉ.
 */

const RACINE = join(import.meta.dirname, "..");
const lire = (p: string) => readFileSync(join(RACINE, p), "utf8");
function tsx(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(join(RACINE, dir))) {
    const rel = `${dir}/${e}`;
    if (statSync(join(RACINE, rel)).isDirectory()) tsx(rel, acc);
    else if (e.endsWith(".tsx")) acc.push(rel);
  }
  return acc;
}
const SOURCES = [...tsx("app"), ...tsx("components")];
const code = (s: string) => s.replace(/\{\/\*[\s\S]*?\*\/\}|\/\*[\s\S]*?\*\//g, " ");

/** Les `<svg>` qui ne sont pas des icônes, et pourquoi. Se périment dans les deux sens. */
const SVG_PERMIS: Record<string, string> = {
  "components/icone.tsx": "le composant lui-même",
  "components/etat-vide.tsx": "le dessin de l'état vide, une illustration de 96 px",
  "components/product-card.tsx": "le dessin de repli d'une carte sans photo, 48 px (classe `icone` pour le trait)",
  "components/home-featured.tsx": "le même dessin de repli, sur la carte vedette",
  "components/connexion-form.tsx": "logos OAuth aux couleurs imposées par les fournisseurs (V-25 A9)",
  "components/brand-logo.tsx": "le logo Zabelie",
  "components/ventes-flash.tsx": "l'éclair plein des ventes flash, une marque et pas une icône de trait",
  "components/etal-dessin.tsx": "illustration de « Ouvrir ma boutique » (V-23)",
  "components/etal-page.tsx": "« Ouvrir ma boutique » garde son dessin propre (V-23)",
  "components/home-vivant.tsx": "décor de l'accueil (V-22)",
  "components/marketplace-universes.tsx": "illustrations des univers, 64 px",
  "components/geo-map.tsx": "carte",
  "components/haiti-map.tsx": "carte",
};
const permis = (f: string) => f in SVG_PERMIS || surCheminArgent(f);

test("I1 — `Icone` : trois tailles, trait fixe en pixels d'écran", () => {
  const comp = lire("components/icone.tsx");
  assert.match(comp, /export type TailleIcone = 16 \| 20 \| 24;/);
  assert.match(comp, /width=\{taille\}\s+height=\{taille\}/);
  assert.match(comp, /aria-hidden="true"/, "décorative par défaut : le libellé voisin se suffit");
  const css = lire("app/globals.css").replace(/\/\*[\s\S]*?\*\//g, " ");
  const corps = (sel: string) => [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(([, s]) => s.split(",").map((x) => x.trim()).includes(sel)).map(([, , c]) => c).join(";");
  assert.match(corps(".icone"), /stroke-width:\s*1\.75/, "un trait, 1,75 px (brief : 1,75 à 2)");
  assert.match(corps(".icone"), /stroke:\s*currentColor/);
  assert.match(corps(".icone"), /fill:\s*none/);
  assert.match(corps(".icone *"), /vector-effect:\s*non-scaling-stroke/, "sans lui, le trait maigrit avec l'icône");
});

test("I2 — chaque icône est en 16, 20 ou 24 px", () => {
  let vues = 0;
  const fautes: string[] = [];
  for (const f of SOURCES) {
    const src = code(lire(f));
    for (const m of src.matchAll(/<(Icone|DepartmentIcon|IconeStudio)\b([^>]*)>/g)) {
      vues++;
      const t = /taille=\{(\d+)\}/.exec(m[2])?.[1];
      if (t !== undefined && !["16", "20", "24"].includes(t)) fautes.push(`${f} <${m[1]} taille={${t}}>`);
      if (/(?<![\w:-])[hw]-[\d.]+(?![\w-])/.test(m[2])) fautes.push(`${f} <${m[1]}> : taille par h-*/w-*, passez \`taille\``);
    }
  }
  assert.ok(vues >= 25, `seulement ${vues} icônes lues`);
  assert.deepEqual(fautes, [], fautes.join("\n"));
});

test("I3 — aucun `<svg>` brut hors des illustrations nommées", () => {
  const fautes = SOURCES.filter((f) => !permis(f) && /<svg[\s>]/.test(code(lire(f))));
  assert.deepEqual(fautes, [], "Icône écrite en SVG brut : passez par `<Icone taille={16|20|24}>` :\n  " + fautes.join("\n  "));
  const perimes = Object.keys(SVG_PERMIS).filter((f) => !/<svg[\s>]/.test(code(lire(f))));
  assert.deepEqual(perimes, [], `exception(s) périmée(s) dans SVG_PERMIS : ${perimes.join(", ")}`);
});

test("I4 — aucune épaisseur de trait locale sur une icône", () => {
  const fautes = SOURCES.filter((f) => !permis(f) && /strokeWidth=/.test(code(lire(f))));
  assert.deepEqual(fautes, [], "`strokeWidth` local : le trait vient de `.icone` :\n  " + fautes.join("\n  "));
  for (const f of ["components/department-icons.tsx", "components/studio-icones.tsx", "components/trust-bar.tsx"]) {
    assert.match(lire(f), /<Icone\b/, `${f} : le jeu d'icônes ne passe plus par \`Icone\``);
  }
});
