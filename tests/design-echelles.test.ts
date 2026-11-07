import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * LES ÉCHELLES DU THÈME — chantier design, Phase 1.4 (V-25 A7, A8, A9).
 *
 * Trois rayons et le rond, trois ombres, des plans de superposition nommés.
 * Mécanique, et volontairement : un cran hors échelle ne casse rien et se voit
 * partout. Il se garde par un comptage, comme il a été trouvé.
 *
 * Le chemin de l'argent n'est pas modifié par ce chantier (brief §1.8). Ses
 * fichiers gardent `rounded-2xl`, que le thème fait valoir `rounded-xl` : ils
 * suivent sans être touchés. La liste se périme dans les deux sens.
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
const THEME = lire("app/zabelie-theme.css");

/** Commentaires retirés : expliquer une règle n'est pas l'enfreindre. */
const code = (s: string) => s.replace(/\{\/\*[\s\S]*?\*\/\}|\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

const CHEMIN_ARGENT = [
  "app/admin/kyc/kyc-admin.tsx",
  "app/admin/paiements-vendeurs/page.tsx",
  "app/facture/[token]/page.tsx",
  "app/paiement/zelle/[orderId]/page.tsx",
  "app/rechaj/page.tsx",
  "app/rechaj/[orderId]/page.tsx",
  "components/business/invoice-editor.tsx",
  "components/buy-button.tsx",
  "components/cart-pay-all.tsx",
  "components/kyc-form.tsx",
  "components/payout-queue.tsx",
];

const RAYON_RETIRE = /(?<![\w-])(?:[a-z-]+:)*rounded(?:-[tblrse]{1,2})?-(?:2xl|3xl)(?![\w-])/;
const OMBRE_RETIREE = /(?<![\w-])(?:[a-z-]+:)*shadow-(?:xl|2xl|\[[^\]]+\])/;
const PLAN_BRUT = /(?<![\w-])(?:[a-z-]+:)*-?z-(?:\d+|\[[^\]]+\])(?![\w-])/;

test("E0 — les détecteurs discriminent", () => {
  assert.ok(RAYON_RETIRE.test('className="rounded-2xl p-4"'));
  assert.ok(RAYON_RETIRE.test('className="sm:rounded-3xl"'));
  assert.ok(RAYON_RETIRE.test('className="rounded-t-2xl"'));
  assert.ok(!RAYON_RETIRE.test('className="rounded-xl rounded-card rounded-lg rounded-full"'));
  assert.ok(OMBRE_RETIREE.test('className="shadow-xl"'));
  assert.ok(OMBRE_RETIREE.test('className="shadow-[0_1px_2px_red]"'));
  assert.ok(!OMBRE_RETIREE.test('className="shadow-sm shadow-md shadow-lg"'));
  assert.ok(PLAN_BRUT.test('className="z-50"'));
  assert.ok(PLAN_BRUT.test('className="focus:z-[60]"'));
  assert.ok(!PLAN_BRUT.test('className="z-(--z-header)"'));
  assert.ok(!PLAN_BRUT.test('className="size-4 grid-z-1"'));
});

test("E1 — rayons : `rounded-2xl` et `rounded-3xl` ne vivent plus que sur le chemin de l'argent", () => {
  assert.ok(SOURCES.length > 200, `${SOURCES.length} fichiers lus`);
  const fautes = SOURCES.filter((f) => !CHEMIN_ARGENT.includes(f) && RAYON_RETIRE.test(code(lire(f))));
  assert.deepEqual(fautes, [], "cran retiré (V-25 A7) : rounded-lg 8, rounded-card 12, rounded-xl 20");
  const perimees = CHEMIN_ARGENT.filter((f) => !RAYON_RETIRE.test(code(lire(f))));
  assert.deepEqual(perimees, [], "exception devenue inutile : à retirer de CHEMIN_ARGENT");
});

test("E2 — le thème fait valoir `2xl` et `3xl` comme `xl`, et écrit la règle", () => {
  assert.match(THEME, /--radius-2xl: var\(--radius-xl\);/);
  assert.match(THEME, /--radius-3xl: var\(--radius-xl\);/);
  assert.match(THEME, /--radius-xl: 1\.25rem;/);
  assert.match(THEME, /--radius-card: 0\.75rem;/);
  assert.match(THEME, /--radius-full: 9999px;/);
});

test("E3 — ombres : trois niveaux, teintés, avec leur couleur sombre", () => {
  const fautes = SOURCES.filter((f) => OMBRE_RETIREE.test(code(lire(f))));
  assert.deepEqual(fautes, [], "ombre hors échelle : shadow-sm, shadow-md ou shadow-lg");
  for (const n of ["sm", "md", "lg"]) {
    assert.match(THEME, new RegExp(`--shadow-${n}: [^;]*var\\(--color-ombre\\);`), `--shadow-${n} ne lit plus la couleur d'ombre`);
  }
  const coupe = THEME.indexOf('[data-theme="dark"]');
  assert.match(THEME.slice(0, coupe), /--color-ombre: rgb\(23 18 58 \/ 0\.14\);/, "teinte indigo en clair");
  assert.match(THEME.slice(coupe), /--color-ombre: rgb\(7 5 5 \/ 0\.5\);/, "V-25 A4 : chaque ombre a sa valeur sombre");
});

test("E4 — plans de superposition nommés, aucun chiffre brut dans le TSX ni dans les feuilles", () => {
  const fautes = SOURCES.filter((f) => PLAN_BRUT.test(code(lire(f))));
  assert.deepEqual(fautes, [], "plan brut : z-(--z-header), z-(--z-drawer), z-(--z-modal), z-(--z-toast), z-(--z-sticky)");
  for (const t of ["--z-base: 1", "--z-sticky: 10", "--z-drawer: 40", "--z-header: 50", "--z-modal: 60", "--z-toast: 70"]) {
    assert.ok(THEME.includes(t), `${t} absent du thème`);
  }
  for (const f of ["app/home-discovery.css", "app/home-vivant.css", "app/editorial-marketplace.css", "app/globals.css"]) {
    assert.doesNotMatch(lire(f), /z-index:\s*-?\d/, `${f} porte un z-index en chiffre`);
  }
});

/* ── VALEURS EN DUR (V-25 A8, A9) ─────────────────────────────────────────── */

/**
 * Ce qui ne peut PAS lire un token, chacun avec sa raison. Une exception se périme
 * dans les deux sens : E7 échoue aussi quand le fichier n'en a plus besoin.
 */
const COULEURS_EN_DUR: Record<string, string> = {
  "app/opengraph-image.tsx": "image générée côté serveur : pas de variable CSS au rendu",
  "app/createur/[id]/opengraph-image.tsx": "image générée côté serveur : pas de variable CSS au rendu",
  "app/produit/[slug]/opengraph-image.tsx": "image générée côté serveur : pas de variable CSS au rendu",
  "app/global-error.tsx": "remplace le layout : aucune feuille de style n'est chargée",
  "components/connexion-form.tsx": "logos Google et Microsoft : couleurs imposées par leurs fournisseurs",
  "app/tableau-de-bord/boutique/affiche/affiche.css": "impression : noir sur blanc, quel que soit le thème",
};

/** Feuilles soumises aux tokens. L'étal (V-23) a sa propre échelle de texte et d'espace ; seules ses couleurs passent par le thème. */
const FEUILLES = [
  "app/editorial-marketplace.css",
  "app/home-discovery.css",
  "app/home-vivant.css",
  "app/ventes-flash.css",
  "app/marketplace-header.css",
  "app/barre-annonce.css",
  "app/globals.css",
];

const COULEUR = /(?<![\w&%-])#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(/;
const code_css = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, " ");

function valeursEnDur(css: string): string[] {
  const fautes: string[] = [];
  for (const m of code_css(css).matchAll(/(?<![\w-])([a-z-]+)\s*:\s*([^;{}]+)/g)) {
    const [, prop, val] = m;
    if (prop === "font-size" && /\d(?:px|rem|em)\b/.test(val) && !/var\(/.test(val)) fautes.push(`${prop}: ${val.trim()}`);
    if (prop === "border-radius" && /[1-9]\d*(?:px|rem|%)/.test(val)) fautes.push(`${prop}: ${val.trim()}`);
    if (/^(?:padding|margin|gap|row-gap|column-gap)(?:-[a-z-]+)?$/.test(prop) && /[1-9]\d*(?:\.\d+)?(?:px|rem)/.test(val)) fautes.push(`${prop}: ${val.trim()}`);
    // Un anneau `0 0 0 6px var(--color-…)` lit un token ; une ombre écrite à la main, non.
    if (prop === "box-shadow" && !/^\s*(?:none|var\(--shadow-[a-z]+\)|0 0 0 \d+px var\(--color-[a-z0-9-]+\))\s*$/.test(val)) fautes.push(`${prop}: ${val.trim()}`);
  }
  return fautes;
}

test("E5 — les détecteurs de valeurs en dur discriminent", () => {
  assert.deepEqual(valeursEnDur(".a { font-size: 14px; }"), ["font-size: 14px"]);
  assert.deepEqual(valeursEnDur(".a { border-radius: 12px; }"), ["border-radius: 12px"]);
  assert.deepEqual(valeursEnDur(".a { padding: 0 22px; }"), ["padding: 0 22px"]);
  assert.deepEqual(valeursEnDur(".a { gap: 2.5rem; }"), ["gap: 2.5rem"]);
  assert.deepEqual(valeursEnDur(".a { box-shadow: 0 1px 2px red; }"), ["box-shadow: 0 1px 2px red"]);
  assert.deepEqual(
    valeursEnDur(".a { font-size: var(--text-sm); border-radius: 0; padding: --spacing(4) 0; margin: 0 auto; box-shadow: var(--shadow-md); }"),
    []
  );
  assert.deepEqual(valeursEnDur(".a { box-shadow: 0 0 0 6px var(--color-bg-1); }"), [], "un anneau qui lit un token n'est pas une ombre en dur");
  assert.deepEqual(valeursEnDur("/* font-size: 14px */ .a { color: red; }"), [], "la prose n'est pas du code");
  assert.ok(COULEUR.test('fill="#17123a"'));
  assert.ok(COULEUR.test("background: rgba(1, 2, 3, .4);"));
  assert.ok(COULEUR.test("color: hsl(248 52% 15%);"));
  assert.ok(!COULEUR.test("url(\"data:image/svg+xml,%3Cpath fill='%23e0580f'/%3E\")"), "une URL de données ne lit pas de variable (A9)");
  assert.ok(!COULEUR.test('<a href="#main">'), "`#main` n'est pas une couleur");
  assert.ok(!COULEUR.test("&#10003;"));
});

test("E6 — aucune feuille soumise aux tokens ne porte de taille, de rayon, d'espace ou d'ombre en dur", () => {
  const fautes = FEUILLES.flatMap((f) => valeursEnDur(lire(f)).map((v) => `${f} — ${v}`));
  assert.deepEqual(fautes, []);
});

test("E7 — aucune couleur en dur hors du thème et des exceptions nommées", () => {
  const css = ["app/editorial-marketplace.css", "app/home-discovery.css", "app/home-vivant.css", "app/ventes-flash.css", "app/marketplace-header.css", "app/barre-annonce.css", "app/globals.css", "app/ouvrir-ma-boutique/etal.css", "app/tableau-de-bord/boutique/affiche/affiche.css"];
  const avecCouleur = (f: string) => COULEUR.test(f.endsWith(".css") ? code_css(lire(f)) : code(lire(f)));
  const fautes = [...SOURCES, ...css].filter((f) => !(f in COULEURS_EN_DUR) && avecCouleur(f));
  assert.deepEqual(fautes, [], "Couleur en dur. Un token du thème, ou une exception nommée avec sa raison :");
  const perimees = Object.keys(COULEURS_EN_DUR).filter((f) => !avecCouleur(f));
  assert.deepEqual(perimees, [], "exception devenue inutile : à retirer de COULEURS_EN_DUR");
});

test("E8 — plus de taille de texte arbitraire dans le TSX, et plus de `--radius-button` fantôme", () => {
  const fautes = SOURCES.filter((f) => /(?<![\w-])(?:[a-z-]+:)*text-\[\d/.test(code(lire(f))));
  assert.deepEqual(fautes, [], "taille arbitraire : un cran de l'échelle");
  assert.doesNotMatch(lire("app/editorial-marketplace.css"), /--radius-button/);
});

test("E9 — échelle de texte : les valeurs du brief, et les trois interlignes", () => {
  const attendus: [string, string][] = [
    ["--text-xs", "0.75rem"],
    ["--text-sm", "0.875rem"],
    ["--text-base", "1rem"],
    ["--text-lg", "1.125rem"],
    ["--text-xl", "1.25rem"],
    ["--text-2xl", "clamp(1.25rem, 1.1145rem + 0.6024vw, 1.5rem)"],
    ["--text-3xl", "clamp(1.75rem, 1.6822rem + 0.3012vw, 1.875rem)"],
    ["--text-4xl", "clamp(2rem, 1.7967rem + 0.9036vw, 2.375rem)"],
    ["--text-display", "clamp(2.25rem, 1.5723rem + 3.012vw, 3.5rem)"],
    ["--leading-display", "1.15"],
    ["--leading-titre", "1.25"],
    ["--leading-corps", "1.55"],
    ["--tracking-titre", "-0.02em"],
  ];
  for (const [t, v] of attendus) assert.ok(THEME.includes(`${t}: ${v};`), `${t} n'est plus ${v}`);
  // Un clamp faux se voit au calcul : 36 px à 360, 56 px à 1 024.
  const px = (ancre: number, pente: number, largeur: number) => (ancre * 16 + (pente / 100) * largeur);
  assert.ok(Math.abs(px(1.5723, 3.012, 360) - 36) < 0.1 && Math.abs(px(1.5723, 3.012, 1024) - 56) < 0.1, "`--text-display` n'atteint pas ses deux bornes");
  assert.ok(Math.abs(px(1.1145, 0.6024, 360) - 20) < 0.1 && Math.abs(px(1.1145, 0.6024, 1024) - 24) < 0.1, "`--text-2xl` n'atteint pas ses deux bornes");
  assert.ok(Math.abs(px(1.6822, 0.3012, 360) - 28) < 0.1 && Math.abs(px(1.6822, 0.3012, 1024) - 30) < 0.1, "`--text-3xl` n'atteint pas ses deux bornes");
  assert.ok(Math.abs(px(1.7967, 0.9036, 360) - 32) < 0.1 && Math.abs(px(1.7967, 0.9036, 1024) - 38) < 0.1, "`--text-4xl` n'atteint pas ses deux bornes");
});

/**
 * UN TOKEN CITÉ DOIT EXISTER. `var(--color-oubli)` ne lève aucune erreur : le
 * navigateur retombe sur la valeur héritée, en silence. C'est ainsi que
 * `--radius-button` a vécu sans jamais être défini (audit Phase 0), et qu'un
 * script a un jour écrit deux couleurs d'étal sans leur token (2026-11-07, écriture
 * du thème refusée par le système, commit parti quand même).
 */
function tokensCites(src: string): string[] {
  const noms = new Set<string>();
  for (const m of src.matchAll(/var\(\s*(--(?:color|text|leading|tracking|radius|shadow|z|motion)-[a-z0-9-]+)/g)) noms.add(m[1]);
  for (const m of src.matchAll(/(?<![\w-])z-\((--z-[a-z-]+)\)/g)) noms.add(m[1]);
  return [...noms];
}

test("E10 — tout token cité par une feuille ou un composant existe dans le thème", () => {
  assert.deepEqual(tokensCites('a { color: var(--color-x); } <p className="z-(--z-header)">'), ["--color-x", "--z-header"], "connu-positif");
  assert.deepEqual(tokensCites("a { margin: --spacing(4); color: red; width: var(--ma-largeur); }"), [], "connu-négatif : hors familles du thème");
  const definis = new Set([...THEME.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
  assert.ok(definis.has("--color-chrome") && definis.has("--z-header") && definis.has("--text-display"), "le thème n'est plus lu");
  const css = ["app/editorial-marketplace.css", "app/home-discovery.css", "app/home-vivant.css", "app/ventes-flash.css", "app/marketplace-header.css", "app/barre-annonce.css", "app/globals.css", "app/ouvrir-ma-boutique/etal.css", "app/tableau-de-bord/boutique/affiche/affiche.css"];
  const manquants: string[] = [];
  let cites = 0;
  for (const f of [...css, ...SOURCES]) {
    for (const t of tokensCites(f.endsWith(".css") ? code_css(lire(f)) : code(lire(f)))) {
      cites++;
      if (!definis.has(t)) manquants.push(`${f} : ${t}`);
    }
  }
  assert.ok(cites > 100, `seulement ${cites} citations lues : le motif ne voit plus le code`);
  assert.deepEqual(manquants, [], "Token cité mais défini nulle part : le navigateur l'ignore sans rien dire");
});
