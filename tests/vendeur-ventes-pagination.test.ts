import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DICT } from "../lib/i18n";

/**
 * LES VENTES DU VENDEUR SE PAGINENT (2026-08-17).
 *
 * Elles étaient plafonnées à huit SANS rien dire : un vendeur avec trente
 * ventes en voyait huit et n'avait aucun moyen de le savoir. C'est le même
 * défaut que les files admin — appliqué cette fois au registre de l'argent de
 * la personne à qui la plateforme doit quelque chose.
 *
 * Je l'avais signalé moi-même en comparant nos écrans à une référence, puis
 * je ne l'avais pas refermé. La trace reste ici.
 */
const sansCommentaires = (src: string) =>
  src.replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const PAGE = sansCommentaires(readFileSync("app/tableau-de-bord/page.tsx", "utf8"));

// ── Plus aucun plafond muet ────────────────────────────────────────────────

test("le plafond dur a disparu — la liste se paginne", () => {
  assert.ok(
    !/\.limit\(8\)/.test(PAGE),
    "`.limit(8)` tronquait les ventes sans le dire"
  );
  const ranges = PAGE.match(/\.range\(\.\.\.bornes\(pageVentes, PAGE_VENTES\)\)/g) ?? [];
  assert.equal(ranges.length, 2, "les DEUX tentatives (avec et sans order_ref)");
});

test("les deux tentatives demandent le COUNT — pas seulement la première", () => {
  /* La sélection est tolérante à `0042` : si `order_ref` manque, on redemande
   * sans elle. Un COUNT posé sur la première seulement laisserait le vendeur
   * sans total sur exactement les bases où la colonne manque — le cas le
   * moins visible, donc le plus durable. */
  const counts = PAGE.match(/\{ count: "exact" \}/g) ?? [];
  assert.ok(counts.length >= 2, `${counts.length} COUNT — attendu au moins 2`);
  assert.match(PAGE, /ventesTotal = first\.count \?\? 0;/);
  assert.match(PAGE, /ventesTotal = retry\.count \?\? 0;/);
});

test("le compte affiché vient du COUNT, jamais de la longueur de la page", () => {
  /* `sales.length` est plafonné à 8 par construction : s'en servir pour dire
   * « 8 ventes » à quelqu'un qui en a trente serait le défaut d'origine sous
   * un autre nom. */
  assert.match(PAGE, /\{ventesTotal\} \{t\(lang, "product\.sales"\)\}/);
  assert.ok(
    !/\{sales\.length\} \{t\(lang, "product\.sales"\)\}/.test(PAGE),
    "la longueur de la page ne doit jamais servir de total"
  );
});

// ── Le pied ────────────────────────────────────────────────────────────────

test("le pied n'apparaît qu'au-delà d'une page", () => {
  assert.match(PAGE, /\{ventesPages > 1 && \(/);
  assert.match(PAGE, /\{ventesPage > 1 \? \(/);
  assert.match(PAGE, /\{ventesPage < ventesPages \? \(/);
});

test("les liens portent l'ancre — pas de retour en haut d'une page longue", () => {
  /* Le tableau de bord fait plusieurs écrans. Sans ancre, tourner une page de
   * ventes renvoie le vendeur au titre, et il doit re-défiler à chaque clic. */
  assert.match(PAGE, /\/tableau-de-bord\?ventes=\$\{ventesPage - 1\}#ventes/);
  assert.match(PAGE, /\/tableau-de-bord\?ventes=\$\{ventesPage \+ 1\}#ventes/);
  assert.match(PAGE, /<section id="ventes" className="mt-10 scroll-mt-24">/);
});

test("les liens du pied respectent la cible tactile de 44 px", () => {
  const liens = [...PAGE.matchAll(/ventes=\$\{ventesPage [-+] 1\}#ventes`\}\s*\n\s*className="([^"]+)"/g)];
  assert.equal(liens.length, 2, "précédent et suivant");
  for (const l of liens) assert.match(l[1], /min-h-11/);
});

test("le repère réutilise les clés du catalogue — pas un second jeu à traduire", () => {
  assert.match(PAGE, /t\(lang, "catalog\.pageOf"\)\s*\n\s*\.replace\("\{n\}", String\(ventesPage\)\)/);
  for (const l of ["fr", "ht", "en", "es"] as const) {
    for (const k of ["catalog.prev", "catalog.more", "catalog.pageOf"]) {
      const v = (DICT[l] as Record<string, string>)[k];
      assert.ok(typeof v === "string" && v.trim(), `${k} absente en ${l}`);
    }
  }
});

test("la page demandée est ramenée dans les bornes AVANT d'être affichée", () => {
  /* `?ventes=99` sur trois pages afficherait « page 99 sur 3 » : un repère qui
   * dit au vendeur qu'il s'est perdu sans lui dire où il est. */
  assert.match(PAGE, /const ventesPage = pageDansBornes\(pageVentes, ventesTotal, PAGE_VENTES\);/);
  assert.match(PAGE, /const ventesPages = nbPages\(ventesTotal, PAGE_VENTES\);/);
});

test("le paramètre d'URL est relu, jamais cru", () => {
  assert.match(PAGE, /const pageVentes = pageValide\(\(await searchParams\)\?\.ventes\);/);
});
