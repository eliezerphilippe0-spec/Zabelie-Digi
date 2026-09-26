import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * MÉTADONNÉES DES PAGES INDEXABLES — mesuré le 2026-09-26 sur zabelie.com :
 * onze pages reprenaient la description de l'accueil (« Achetez et vendez en
 * Haïti… »), sans URL canonique ; la page hors réseau était indexable ; trois
 * titres ne portaient pas la marque.
 */

const PAGES: Record<string, string> = {
  "app/vendre/page.tsx": "/vendre",
  "app/vendre/physique/page.tsx": "/vendre/physique",
  "app/developpeurs/page.tsx": "/developpeurs",
  "app/pro/page.tsx": "/pro",
  "app/conditions/page.tsx": "/conditions",
  "app/confidentialite/page.tsx": "/confidentialite",
  "app/produits-interdits/page.tsx": "/produits-interdits",
};

const lire = (f: string) => readFileSync(f, "utf8");
const bloc = (src: string) => src.match(/export const metadata = \{[\s\S]*?\n\};/)?.[0] ?? src.match(/export const metadata = \{.*\};/)?.[0] ?? "";
const description = (src: string) => bloc(src).match(/description:\s*"([^"]+)"/)?.[1];

test("S1 — chaque page indexable a SA description (70 à 160 signes) et sa canonique", () => {
  const vues = new Map<string, string>();
  for (const [f, chemin] of Object.entries(PAGES)) {
    const src = lire(f);
    const d = description(src);
    assert.ok(d, `${f} : pas de description — elle hériterait de celle de l'accueil`);
    assert.ok(d!.length >= 70 && d!.length <= 160, `${f} : description de ${d!.length} signes`);
    assert.ok(!vues.has(d!), `${f} : même description que ${vues.get(d!)}`);
    vues.set(d!, f);
    assert.match(bloc(src), new RegExp(`alternates: \\{ canonical: "${chemin.replace(/\//g, "\\/")}" \\}`), `${f} : canonique absente ou fausse`);
  }
});

test("S2 — les pages utilitaires sont noindex, et PAS interdites au robot (sinon le noindex n'est jamais lu)", () => {
  for (const f of ["app/hors-ligne/page.tsx", "app/mot-de-passe-oublie/page.tsx"]) {
    assert.match(bloc(lire(f)), /robots: \{ index: false, follow: true \}/, `${f} : indexable`);
  }
  const robots = lire("app/robots.ts");
  assert.doesNotMatch(robots, /"\/hors-ligne"|"\/mot-de-passe-oublie"/);
});

test("S3 — les titres traduits portent la marque", () => {
  for (const [f, cle] of [["app/categories/page.tsx", "directory.title"], ["app/aide/page.tsx", "aide.title"], ["app/recharges/page.tsx", "recharges.title"]]) {
    assert.match(lire(f), new RegExp(`title: \`\\$\\{t\\(lang, "${cle.replace(".", "\\.")}"\\)\\} — Zabelie\``), `${f} : titre sans la marque`);
  }
});

test("S4 — le sitemap annonce l'API publique et les règles de vente", () => {
  const s = lire("app/sitemap.ts");
  assert.match(s, /"\/produits-interdits",/);
  assert.match(s, /"\/developpeurs",/);
});
