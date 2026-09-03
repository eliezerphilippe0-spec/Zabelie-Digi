import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pageValide, bornes, nbPages, pageDansBornes } from "../lib/pagination";

/**
 * L'ARITHMÉTIQUE DE PAGINATION, UNE SEULE FOIS (2026-08-17).
 *
 * Trois surfaces paginent : le catalogue, les files d'action admin, et les
 * ventes du vendeur. Trois copies de « borne basse, borne haute, nombre de
 * pages », c'est se garantir que la correction d'un décalage n'atterrira que
 * sur deux.
 *
 * ⚠️ LE PIÈGE EST DÉJÀ TOMBÉ, et il est encodé ici plutôt que raconté :
 * `Math.max(1, NaN)` vaut NaN, pas 1. Une borne « gardée » de cette façon
 * laisse passer un `range(NaN, NaN)` — qui ne rend pas « rien », mais une
 * fenêtre que personne n'a demandée. Attrapé par le test, pas à la relecture.
 */

test("une page absurde retombe sur 1 — y compris NaN", () => {
  for (const brut of ["0", "-4", "abc", "", undefined, null, "1e9"]) {
    assert.equal(pageValide(brut), 1, JSON.stringify(brut));
  }
  assert.equal(pageValide(Number.NaN), 1, "NaN : le piège d'origine");
  assert.equal(pageValide(Number.POSITIVE_INFINITY), 1, "Infinity n'est pas fini");
});

test("une page valide passe, et se tronque à l'entier", () => {
  assert.equal(pageValide("2"), 2);
  assert.equal(pageValide(7), 7);
  assert.equal(pageValide(3.9), 3, "pas de demi-page");
});

test("les bornes sont INCLUSIVES aux deux bouts, comme .range()", () => {
  assert.deepEqual(bornes(1, 8), [0, 7]);
  assert.deepEqual(bornes(2, 8), [8, 15]);
  assert.deepEqual(bornes(3, 25), [50, 74]);
});

test("aucune borne négative ni NaN ne sort d'ici", () => {
  for (const p of [0, -3, Number.NaN, Number.POSITIVE_INFINITY]) {
    const [de, a] = bornes(p, 8);
    assert.equal(de, 0, `borne basse pour ${p}`);
    assert.equal(a, 7, `borne haute pour ${p}`);
  }
});

test("le nombre de pages vaut au moins 1 — une liste vide reste « 1 sur 1 »", () => {
  assert.equal(nbPages(0, 8), 1);
  assert.equal(nbPages(1, 8), 1);
  assert.equal(nbPages(8, 8), 1, "huit tiennent en une page");
  assert.equal(nbPages(9, 8), 2, "la neuvième ouvre la page 2");
  assert.equal(nbPages(Number.NaN, 8), 1);
  assert.equal(nbPages(-5, 8), 1);
});

test("une page au-delà de la dernière est ramenée dans les bornes", () => {
  /* « Page 99 sur 3 » dit au visiteur qu'il s'est perdu sans lui dire où il
   * est. Et la requête, elle, aurait rendu une fenêtre vide. */
  assert.equal(pageDansBornes(99, 20, 8), 3);
  assert.equal(pageDansBornes(2, 20, 8), 2);
  assert.equal(pageDansBornes(1, 0, 8), 1, "liste vide : page 1");
  assert.equal(pageDansBornes(Number.NaN, 20, 8), 1);
});

// ── Les trois surfaces s'en servent, aucune ne recopie ─────────────────────

/* ⚠️ Les interdictions de chaîne portent sur le CODE, jamais sur les
 * commentaires. La première version de l'assertion ci-dessous refusait
 * `Math.max(1,` partout — y compris dans le commentaire qui EXPLIQUE pourquoi
 * cette forme est piégeuse. Interdire un texte, c'est aussi interdire de le
 * raconter : la sonde de `0059` a déjà mordu là-dessus, et l'en-tête du
 * pipeline d'images le redit. */
const sansCommentaires = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("les files admin DÉLÈGUENT — plus d'arithmétique recopiée", () => {
  const FILE = sansCommentaires(readFileSync("lib/file-attente.ts", "utf8"));
  assert.match(FILE, /from "@\/lib\/pagination"/);
  assert.match(FILE, /return bornes\(page, PAGE_FILE\);/);
  assert.match(FILE, /const pages = nbPages\(total, PAGE_FILE\);/);
  /* Le garde `Math.max(1, …)` laisse passer NaN. Il survivait dans
     `surveillerFile`, à trois lignes de son jumeau déjà corrigé — trouvé par
     ce croisement, pas à la relecture. */
  assert.ok(
    !/Math\.max\(1,/.test(FILE),
    "l'ancien garde `Math.max(1, …)` — qui laisse passer NaN — doit avoir disparu"
  );
  assert.match(FILE, /page: pageDansBornes\(page, total, PAGE_FILE\)/);
});

test("les ventes du vendeur passent par le module partagé", () => {
  const TB = readFileSync("app/tableau-de-bord/page.tsx", "utf8");
  assert.match(TB, /\.range\(\.\.\.bornes\(pageVentes, PAGE_VENTES\)\)/);
  assert.match(TB, /const ventesPages = nbPages\(ventesTotal, PAGE_VENTES\);/);
  assert.match(TB, /const ventesPage = pageDansBornes\(pageVentes, ventesTotal, PAGE_VENTES\);/);
});
