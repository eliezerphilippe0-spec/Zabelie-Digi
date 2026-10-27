import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { PURCHASE_VIEWS } from "@/lib/purchase-center";
import { loadRoute } from "./helpers/route-harness";

/**
 * CHAQUE ESPACE A LE SQUELETTE DE SA PAGE — audit du système de design du
 * 2026-10-27, constat m6.
 *
 * Mesuré à `acc72c9` : quatre `loading.tsx` (racine, catalogue, fiche
 * produit, boutique). `/tableau-de-bord`, `/mes-achats` et `/vendre`
 * retombaient sur `app/loading.tsx`, qui dessine le hero et la grille de
 * produits de l'ACCUEIL : une seconde de vitrine acheteur avant un tableau de
 * bord vendeur, ou avant la liste des commandes qu'on vient de payer.
 *
 * Ce qui est gardé COMMANDE la forme, pas un libellé :
 *   • le conteneur du squelette est la classe EXACTE du cadre de la page, lue
 *     dans la source de la page elle-même — si la page change de cadre, le
 *     squelette rougit au lieu de dériver en silence ;
 *   • la grille de cartes produit de l'accueil (`SkeletonGrid`/`SkeletonCard`)
 *     n'y est pas ;
 *   • les pastilles de vues de « Mes achats » sont rendues depuis la MÊME liste
 *     que la page (`PURCHASE_VIEWS`) — vérifié en exécutant le squelette.
 */

const lire = (f: string) => readFileSync(f, "utf8");

/** Le cadre de `VendeurShell` : la classe du <div> racine, celui qui tient le menu. */
function cadreVendeur(): string {
  const m = /return \(\s*<div className="([^"]+)">\s*<nav aria-label=/.exec(lire("components/vendeur-shell.tsx"));
  assert.ok(m, "cadre de VendeurShell introuvable : l'extraction a bougé");
  return m![1];
}

/** Le cadre de « Mes achats » : la classe du <main> de son `Shell`, celui qui porte le <h1>. */
function cadreAchats(): string {
  const m = /<main id="main" className="([^"]+)">\s*<h1\b/.exec(lire("app/mes-achats/page.tsx"));
  assert.ok(m, "cadre de mes-achats introuvable : l'extraction a bougé");
  return m![1];
}

const SQUELETTES: Array<{ f: string; cadre: () => string }> = [
  { f: "app/tableau-de-bord/loading.tsx", cadre: cadreVendeur },
  { f: "app/vendre/loading.tsx", cadre: cadreVendeur },
  { f: "app/mes-achats/loading.tsx", cadre: cadreAchats },
];

test("SQ1 — chaque espace a son loading.tsx, qui rend le squelette partagé sous la vraie barre", () => {
  for (const { f } of SQUELETTES) {
    assert.ok(existsSync(f), `${f} manque : la page retombe sur le squelette de l'accueil`);
    const src = lire(f);
    assert.match(src, /from "@\/components\/skeleton"/, `${f} n'utilise pas le squelette partagé`);
    assert.match(src, /return \(\s*<SkeletonPage>/, `${f} doit envelopper dans <SkeletonPage> (aria-busy)`);
    assert.match(src, /<SkeletonPage>\s*<SiteNav \/>/, `${f} : la barre de navigation reste réelle pendant l'attente`);
    // Aucun texte visible : un squelette ne se traduit pas.
    assert.doesNotMatch(src.replace(/\{\/\*[\s\S]*?\*\/\}/g, ""), />\s*[\p{L}][^<{]*</u, `${f} porte une chaîne visible`);
  }
});

test("SQ2 — le conteneur du squelette est le CADRE de sa page, lu dans la page", () => {
  for (const { f, cadre } of SQUELETTES) {
    const c = cadre();
    assert.ok(c.split(/\s+/).length >= 3, `cadre suspect pour ${f} : « ${c} »`);
    assert.ok(lire(f).includes(`className="${c}"`), `${f} ne reprend pas le cadre de sa page : « ${c} »`);
  }
});

test("SQ3 — aucun ne redessine l'accueil : ni grille de cartes produit, ni hero", () => {
  const accueil = lire("app/loading.tsx");
  // Témoin : la signature cherchée est bien celle de l'accueil (sinon le test ne prouve rien).
  assert.match(accueil, /<SkeletonGrid\b/);
  for (const { f } of SQUELETTES) {
    const src = lire(f);
    assert.doesNotMatch(src, /\bSkeleton(Grid|Card)\b/, `${f} dessine la grille de produits de l'accueil`);
    assert.notEqual(src, accueil, `${f} est une copie du squelette de l'accueil`);
  }
});

test("SQ4 — « Mes achats » : une pastille par vue, depuis la liste de la page", () => {
  type N = { type: unknown; props: Record<string, unknown> };
  const jsx = (type: unknown, props: Record<string, unknown>): N => ({ type, props });
  const mod = loadRoute("app/mes-achats/loading.tsx", {
    "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "fragment" },
    "@/components/site-nav": { SiteNav: "SiteNav" },
    "@/components/skeleton": { SkeletonBlock: "SkeletonBlock", SkeletonPage: "SkeletonPage" },
    "@/lib/purchase-center": { PURCHASE_VIEWS },
  }) as unknown as { default: () => N };
  const tous: N[] = [];
  const parcourir = (n: unknown) => {
    if (Array.isArray(n)) return n.forEach(parcourir);
    if (!n || typeof n !== "object") return;
    tous.push(n as N);
    parcourir((n as N).props?.children);
  };
  parcourir(mod.default());
  const rangees = tous.filter((n) => Array.isArray(n.props?.children) && (n.props.children as N[]).every((c) => typeof c?.type === "function" && (c.type as { name: string }).name === "Pastille"));
  assert.equal(rangees.length, 1, "la rangée de pastilles de vues est introuvable");
  assert.equal((rangees[0].props.children as N[]).length, PURCHASE_VIEWS.length, "une pastille par vue de la page, ni plus ni moins");
});
