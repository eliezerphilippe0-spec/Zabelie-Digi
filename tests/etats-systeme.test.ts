import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * ÉTATS SYSTÈME — chantier design, Phase 2.5 (`docs/design/PHASE-2.md`).
 *
 * Le brief : squelettes en `opacity`, états vides illustrés avec une phrase
 * d'action, erreur réseau avec « Eseye ankò ». Les squelettes et la reprise
 * existaient ; ce qui manquait : un état vide commun (six mises en forme, un
 * seul dessin, en orange), et un bouton de reprise à 44 px.
 */

const lire = (p: string) => readFileSync(join(import.meta.dirname, "..", p), "utf8");
const sansCommentaires = (s: string) => s.replace(/\{\/\*[\s\S]*?\*\/\}|\/\*[\s\S]*?\*\//g, " ");

test("S1 — `EtatVide` : un dessin, un titre, l'action de l'écran, aucune chaîne à lui", () => {
  const comp = sansCommentaires(lire("components/etat-vide.tsx"));
  assert.match(comp, /<svg className="icone etat-vide-dessin"[^>]*aria-hidden="true"/, "le dessin est décoratif et suit le trait des icônes");
  assert.match(comp, /<Titre className="etat-vide-titre">\{titre\}<\/Titre>/);
  assert.match(comp, /\{children\}/, "l'action vient de l'écran");
  // Aucun texte visible écrit dans le composant : tout passe par t() chez l'appelant.
  const textes = [...comp.matchAll(/>([^<>{}]*[A-Za-zÀ-ÿ][^<>{}]*)</g)].map((m) => m[1].trim()).filter(Boolean);
  assert.deepEqual(textes, [], "chaîne en dur dans l'état vide");
  const css = lire("app/globals.css").replace(/\/\*[\s\S]*?\*\//g, " ");
  const regles = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(([, s]) => /\.etat-vide/.test(s));
  assert.ok(regles.length >= 4, "les règles de l'état vide manquent");
  for (const [, sel, corps] of regles) assert.doesNotMatch(corps, /--color-(?:brand|accent)/, `« ${sel.trim()} » : l'orange reste au bouton`);
});

test("S2 — les écrans vides côté acheteur l'emploient", () => {
  const emplois: Array<[string, number]> = [
    ["app/catalogue/page.tsx", 7],
    ["app/panier/page.tsx", 1],
    ["app/messages/page.tsx", 1],
    ["app/mes-achats/page.tsx", 1],
    ["components/collection-page.tsx", 1],
    ["components/boutique-vue.tsx", 1],
  ];
  for (const [f, n] of emplois) {
    const vus = (lire(f).match(/<EtatVide[\s>]/g) ?? []).length;
    assert.equal(vus, n, `${f} : ${vus} état(s) vide(s) commun(s), ${n} attendu(s)`);
  }
  for (const f of ["app/catalogue/page.tsx", "app/editorial-marketplace.css"]) {
    assert.doesNotMatch(lire(f), /catalogue-welcome|empty-shop/, `${f} : l'ancien état vide du catalogue est revenu`);
  }
});

test("S3 — l'erreur réseau propose de réessayer, à 44 px, dans les quatre langues", () => {
  const erreur = lire("app/error.tsx");
  assert.match(erreur, /onClick=\{echecDeChargement \? \(\) => window\.location\.reload\(\) : reset\}\s*className="bouton bouton-primaire"/,
    "la reprise est l'action principale de la page d'erreur");
  assert.match(lire("components/bouton-reessayer.tsx"), /onClick=\{\(\) => location\.reload\(\)\}\s*className="bouton bouton-primaire"/);
  assert.match(lire("app/hors-ligne/page.tsx"), /<BoutonReessayer libelle=\{t\(lang, "offline\.retry"\)\} \/>/);
  const libelles = lire("lib/i18n-erreur.ts");
  for (const r of ["Réessayer", "Eseye ankò", "Try again", "Reintentar"]) assert.ok(libelles.includes(`retry: "${r}"`), `libellé de reprise absent : ${r}`);
});

test("S4 — le squelette bat en opacité, s'arrête en mouvement réduit, et a la forme de la carte", () => {
  const sq = lire("components/skeleton.tsx");
  assert.match(sq, /const PULSE = "animate-pulse motion-reduce:animate-none /, "Tailwind `animate-pulse` n'anime que l'opacité");
  // Même anatomie que la carte depuis le retrait de « Gade pwodui a » : image,
  // deux lignes de nom, prix, vendeur.
  const carte = /export function SkeletonCard\(\)[\s\S]*?\n\}/.exec(sq)?.[0] ?? "";
  assert.equal((carte.match(/<SkeletonBlock className="h-[34] /g) ?? []).length, 4, "quatre lignes sous l'image, comme la carte");
  assert.match(carte, /aspect-square/);
});
