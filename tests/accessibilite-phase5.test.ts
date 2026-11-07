import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { DICT } from "../lib/i18n";
import { balises, attribut } from "./helpers/balises-jsx";

/**
 * ACCESSIBILITÉ — chantier design, Phase 5 (`docs/design/RAPPORT-FINAL.md`).
 *
 * Ce que le garde axe de la CI (`e2e/accessibilite.spec.ts`) ne voyait pas :
 * il tourne en mode démonstration, sans session ni panier, et sur les seules
 * règles WCAG. Mesuré le 2026-11-07 avec une session et trois articles :
 * « Panyen (3) » échouait à WCAG 2.5.3 sur toutes les pages connectées, et le
 * catalogue comme les favoris passaient du h1 aux h3 des cartes.
 */

const lire = (p: string) => readFileSync(p, "utf8");
const LANGUES = Object.keys(DICT) as Array<keyof typeof DICT>;
const code = (s: string) => s.replace(/\{\/\*[\s\S]*?\*\/\}|\/\*[\s\S]*?\*\//g, " ");

test("A1 — les liens panier tirent leur nom de leur contenu : pas d'aria-label qui diverge du texte visible", () => {
  /* Essai dans Chrome avant correction : « Panyen (3) » ET « Panyen 3 »
   * échouent à label-content-name-mismatch (axe compare le texte visible
   * collé, « panyen3 ») ; seul le nom tiré du contenu passe, aux deux largeurs. */
  for (const f of ["components/site-nav.tsx", "components/barre-navigation.tsx"]) {
    const liens = balises(code(lire(f)), ["Link"]).filter((b) => /(?:^|\s)href="\/panier"/.test(b.attrs));
    assert.equal(liens.length, 1, `${f} : un lien panier attendu, ${liens.length} lu(s)`);
    assert.equal(attribut(liens[0].attrs, "aria-label"), null, `${f} : le lien panier porte de nouveau un aria-label`);
  }
  // Le compteur se lit : il fait partie du nom.
  assert.match(lire("components/barre-navigation.tsx"), /<span className="barre-nav-compteur numeric">\{panier\}<\/span>/);
  // Dans l'en-tête, le libellé caché sous lg reste LU : sinon le lien n'a plus de nom entre 768 et 1 023 px.
  assert.match(lire("components/site-nav.tsx"), /<span className="sr-only text-sm font-semibold lg:not-sr-only">\{t\(lang, "cart\.title"\)\}<\/span>/);
});

/** Tous les .tsx sous app/ et components/. */
function sources(d: string, out: string[] = []): string[] {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    if (statSync(p).isDirectory()) sources(p, out);
    else if (p.endsWith(".tsx")) out.push(p.replace(/\\/g, "/"));
  }
  return out;
}

test("A2 — chaque fichier qui rend des cartes produit (h3) pose un h2 avant elles", () => {
  /* Croisement : la carte produit titre en h3 (`components/product-card.tsx`).
   * Un fichier qui la rend sans h2 au-dessus fait sauter un niveau. */
  assert.match(lire("components/product-card.tsx"), /<h3 className=\{`line-clamp-2\b/, "la carte ne titre plus en h3 : ce croisement ne regarde plus la bonne chose");
  const fichiers = [...sources("app"), ...sources("components")].filter((f) => /<ProductCard\b/.test(code(lire(f))));
  assert.ok(fichiers.length >= 4, `seulement ${fichiers.length} fichiers rendent ProductCard : le motif ne voit plus les cartes`);
  const fautes = fichiers.filter((f) => {
    const s = code(lire(f));
    const h2 = s.search(/<h2\b|titreBalise="h2"/);
    return h2 < 0 || h2 > s.search(/<ProductCard\b/);
  });
  assert.deepEqual(fautes, [], "Cartes produit sans h2 au-dessus :\n  " + fautes.join("\n  "));
});

test("A3 — catalogue et favoris : le h2 est rendu sans condition sur la grille, et traduit", () => {
  const cat = code(lire("app/catalogue/page.tsx"));
  // Directement dans la section des résultats, avant tout branchement.
  assert.match(cat, /<section className="mx-auto max-w-6xl px-5 pb-16">\s*<h2 className="sr-only">\{t\(lang, "catalog\.results\.heading"\)\}<\/h2>\s*\{approchants\.length > 0 \?/);
  const fav = code(lire("components/collection-page.tsx"));
  assert.match(fav, /\{kind === "favorites" && ids\.length > 0 && <h2 className="sr-only">\{t\(lang, "home\.products"\)\}<\/h2>\}/);
  for (const lang of LANGUES) {
    const d = DICT[lang] as Record<string, string>;
    assert.ok(d["catalog.results.heading"] && d["home.products"], `${lang} : titre de grille manquant`);
  }
});

test("A4 — fiche : la photo principale, image LCP quand elle existe, est demandée en priorité et réserve sa place", () => {
  /* Brief §2 : « dimensions explicites, priorité sur la seule image LCP ». Sur
   * une fiche avec photo, c'est elle ; sans `fetchPriority`, le navigateur la
   * demandait au rang d'une image ordinaire. */
  const img = balises(code(lire("components/galerie-produit.tsx")), ["img"]).filter((b) => /(?:^|\s)src=\{actif\.url\}/.test(b.attrs));
  assert.equal(img.length, 1, "photo principale introuvable");
  const a = img[0].attrs;
  assert.deepEqual(attribut(a, "fetchPriority"), { litteral: "high" });
  assert.ok(attribut(a, "width") && attribut(a, "height"), "dimensions explicites manquantes");
  assert.equal(attribut(a, "loading"), null, "l'image LCP ne se diffère jamais");
});
