import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { progressionActe, lireFenetre } from "../lib/etal-defilement";
import { estCheminLocalisable } from "../lib/langue-url";

/**
 * « OUVRIR MA BOUTIQUE » (V-23, décision porteur du 2026-10-14).
 *
 *  O1  aucun chiffre commercial en dur : le taux vient de `lireTauxCommission`,
 *      le barème de lancement l'emporte quand il est activé, J+7 vient de
 *      `MATURATION_DAYS`, l'état de MonCash de `getMonCashAvailability` ;
 *  O2  rien ne quitte la page : ni formulaire, ni requête ;
 *  O3  garde-fous de V-22 repris par V-23 : aucun texte animé en opacité, tout
 *      le mouvement sous `no-preference` (ou sous l'attribut que le composant
 *      ne pose jamais en mouvement réduit), durées en tokens ;
 *  O4  le décor n'est pas une offre : `aria-hidden`, ni prix ni HTG ;
 *  O5  la progression d'acte est juste aux bornes ;
 *  O6  la route existe pour les langues, le sitemap et l'audit axe.
 *
 * Chaque garde a été rougie par une mutation avant d'être crue (CLAUDE.md,
 * « un instrument non éprouvé ne prouve rien ») : voir la PR de V-23.
 */

const RACINE = join(import.meta.dirname, "..");
const lire = (p: string) => readFileSync(join(RACINE, p), "utf8");
const sansCommentaires = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const PAGE = sansCommentaires(lire("app/ouvrir-ma-boutique/page.tsx"));
const COMPOSANT = sansCommentaires(lire("components/etal-page.tsx"));
const DESSIN = sansCommentaires(lire("components/etal-dessin.tsx"));
const MOTEUR = sansCommentaires(lire("lib/etal-defilement.ts"));
const CSS = sansCommentaires(lire("app/ouvrir-ma-boutique/etal.css"));
const I18N = lire("lib/i18n.ts");

/** Les valeurs des clés `etal.*`, dans les quatre langues. */
const VALEURS_ETAL = [...I18N.matchAll(/^\s*"(etal\.[^"]+)":\s*"([^"]*)",$/gm)].map((m) => ({ cle: m[1], val: m[2] }));

test("O1 — non-vacuité : les clés etal.* sont lues dans les quatre langues", () => {
  assert.ok(VALEURS_ETAL.length >= 4 * 50, `${VALEURS_ETAL.length} valeurs lues : extraction suspecte`);
});

test("O1 — le taux affiché est LU en base, jamais écrit", () => {
  assert.match(PAGE, /await\s+lireTauxCommission\(\s*supabase/);
  assert.match(PAGE, /"etal\.argent\.taux",\s*\{\s*taux:\s*formaterTaux\(lecture\.taux\.standard\),\s*palier:\s*formaterTaux\(lecture\.taux\.elite\)\s*\}/);
  // Le calcul passe par l'arrondi en vigueur, sur le taux reçu en props.
  assert.match(COMPOSANT, /p\s*-\s*commissionAuTaux\(p,\s*bps\)/);
  assert.match(PAGE, /bps:\s*lecture\.taux\.standard/);
  // Aucun pourcentage ni montant de commission dans les libellés de la page.
  const chiffres = VALEURS_ETAL.filter(({ val }) => /\d\s*%|\b900\b|\b1[\s ]?000\b/.test(val));
  assert.deepEqual(chiffres, [], "chiffre commercial en dur dans un libellé etal.*");
});

test("O1 — le barème de lancement, quand il est activé, remplace le taux simple", () => {
  assert.match(PAGE, /const bareme = await readSellerPricing\(supabase\);\s*return bareme \? \{ mode: "bareme", bareme \} : \{ mode: "taux", taux \};/);
  assert.match(PAGE, /lecture\.mode === "bareme" \? <SellerPricingPanel pricing=\{lecture\.bareme\}/);
  // Une lecture en échec n'invente pas de frais : aucun chiffre, un renvoi.
  assert.match(PAGE, /catch \(e\) \{[\s\S]{0,300}return \{ mode: "indisponible" \};/);
  assert.match(COMPOSANT, /tarifs\.mode === "taux" && \(\s*<p className="etal-calcul">/);
});

test("O1 — J+7 et l'état de MonCash viennent de leur source", () => {
  assert.match(PAGE, /"etal\.argent\.e4",\s*\{\s*jours:\s*String\(MATURATION_DAYS\)\s*\}/);
  assert.match(PAGE, /const moncash = getMonCashAvailability\(\);/);
  assert.match(PAGE, /moncash === "production" \? null : t\(lang, MONCASH_AVAILABILITY_LABELS\[moncash\]\)/);
  const enDur = VALEURS_ETAL.filter(({ val }) => /\b7\s*(jours|jou|days|días)\b|MonCash|NatCash/i.test(val));
  assert.deepEqual(enDur, [], "délai ou état de paiement écrit en dur dans un libellé etal.*");
});

test("O2 — rien ne quitte la page : ni formulaire, ni requête", () => {
  for (const [nom, src] of [["composant", COMPOSANT], ["page", PAGE], ["moteur", MOTEUR], ["dessin", DESSIN]] as const) {
    assert.doesNotMatch(src, /<form[\s>]/, `${nom} : <form>`);
    assert.doesNotMatch(src, /\bfetch\s*\(|sendBeacon|XMLHttpRequest|new\s+WebSocket/, `${nom} : requête`);
  }
  // Le nom ne va que dans le stockage de CE navigateur.
  assert.match(COMPOSANT, /localStorage\.setItem\(CLE_NOM, n\)/);
});

test("O3 — aucun texte n'est animé en opacité ; l'opacité ne touche que le décor", () => {
  // Blocs les plus internes : sélecteur { déclarations }.
  const blocs = [...CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1].trim(), corps: m[2] }));
  assert.ok(blocs.length > 60, `${blocs.length} blocs lus : extraction suspecte`);
  const fautifs = blocs
    .filter(({ corps }) => /(^|[;\s])opacity\s*:/.test(corps) || /transition[^;]*opacity/.test(corps))
    .filter(({ sel, corps }) => {
      if (/::placeholder/.test(sel) && /opacity:\s*1\s*;/.test(corps)) return false;
      return !/\.etal--anime \.etal-(colline|soleil|enseigne|pinceau|tuile)\b/.test(sel);
    })
    .map(({ sel }) => sel);
  assert.deepEqual(fautifs, [], "opacité animée hors du décor");
  assert.doesNotMatch(MOTEUR, /\.style\.opacity|setProperty\(\s*["']opacity/, "le moteur écrit une opacité");
});

test("O3 — le mouvement vit sous no-preference ou sous [data-etal-anime], en tokens", () => {
  const np = /@media \(prefers-reduced-motion: no-preference\)[^{]*\{/g;
  const zones: [number, number][] = [];
  for (const m of CSS.matchAll(np)) {
    let profondeur = 0;
    for (let i = m.index! + m[0].length - 1; i < CSS.length; i++) {
      if (CSS[i] === "{") profondeur++;
      else if (CSS[i] === "}" && --profondeur === 0) { zones.push([m.index!, i]); break; }
    }
  }
  assert.ok(zones.length >= 3, `${zones.length} zones no-preference lues`);
  const dedans = (i: number) => zones.some(([a, b]) => i > a && i < b);
  const temps = [...CSS.matchAll(/(?<![-\w])(animation|transition)\s*:\s*([^;]+);/g)];
  assert.ok(temps.length >= 4, `${temps.length} animations/transitions lues`);
  for (const m of temps) {
    assert.ok(dedans(m.index!), `hors de no-preference : « ${m[0]} »`);
    assert.doesNotMatch(m[2], /\d+m?s\b/, `durée écrite en dur : « ${m[0]} »`);
    assert.match(m[2], /var\(--motion-(fast|base|slow)\)/, `durée hors tokens : « ${m[0]} »`);
  }
  // Ce qui suit le défilement n'est posé que si le composant a monté le moteur,
  // et il ne le monte jamais en mouvement réduit.
  assert.match(COMPOSANT, /if \(!reduit\) el\.setAttribute\("data-etal-anime", ""\);/);
  assert.match(CSS, /\.page-etal\[data-etal-anime\] \.etal-scene \{ position: sticky;/);
});

test("O4 — le décor n'est pas une offre", () => {
  assert.match(DESSIN, /<svg className=\{`etal [^`]*`\} viewBox="0 0 480 440" aria-hidden="true"/);
  assert.doesNotMatch(DESSIN, /HTG|gourde|\bprix\b/i);
  // Le seul texte du dessin est le nom reçu en props.
  const textes = [...DESSIN.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/g)].map((m) => m[1].trim());
  assert.deepEqual(textes, ["{nom}"]);
});

test("O5 — progression d'acte : bornes justes, jamais de division par zéro", () => {
  const vh = 800;
  // Épinglé : 0 quand son haut touche le haut, 1 quand son bas touche le bas.
  assert.equal(progressionActe("epingle", 1000, 1000, 2880, vh), 0);
  assert.equal(progressionActe("epingle", 1000 + 1040, 1000, 2880, vh), 0.5);
  assert.equal(progressionActe("epingle", 1000 + 2080, 1000, 2880, vh), 1);
  assert.equal(progressionActe("epingle", 0, 1000, 2880, vh), 0);
  assert.equal(progressionActe("epingle", 99999, 1000, 2880, vh), 1);
  // Un acte d'un seul écran : dénominateur de 1 px, pas d'Infinity ni de NaN.
  const p = progressionActe("epingle", 1000, 1000, vh, vh);
  assert.ok(Number.isFinite(p) && p === 0);
  // Flux : 0 à l'entrée par le bas, 1 à la sortie par le haut.
  assert.equal(progressionActe("flux", 200, 1000, 800, vh), 0);
  assert.equal(progressionActe("flux", 1800, 1000, 800, vh), 1);
  assert.equal(progressionActe("flux", 1000, 1000, 800, vh), 0.5);
  assert.deepEqual(lireFenetre("0.03 0.26", [0, 0.3]), [0.03, 0.26]);
  assert.deepEqual(lireFenetre("x", [0, 0.3]), [0, 0.3]);
});

test("O6 — la route est localisable, indexée et auditée", () => {
  assert.equal(estCheminLocalisable("/ouvrir-ma-boutique"), true);
  assert.equal(estCheminLocalisable("/ouvrir-ma-boutique/x"), false);
  assert.match(lire("app/sitemap.ts"), /^\s*"\/ouvrir-ma-boutique",$/m);
  const axe = lire("e2e/accessibilite.spec.ts");
  assert.match(axe, /^\s*"\/ouvrir-ma-boutique",$/m);
  assert.match(axe, /^\s*"\/ht\/ouvrir-ma-boutique",$/m);
  // La page porte son propre lien d'évitement (elle n'a pas SiteNav).
  assert.match(COMPOSANT, /<a href="#main" className="etal-evitement">\s*\{L\.evitement\}/);
  assert.match(PAGE, /evitement:\s*t\(lang, "a11y\.skip"\)/);
});
