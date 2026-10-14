import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { noteAffichee, SEUIL_NOTE_AFFICHEE } from "../lib/note-affichee";

/**
 * SEUIL D'AFFICHAGE DES NOTES — `docs/26` §14 : « aucune note affichée sous un
 * seuil minimal d'avis ». Écart mesuré le 2026-10-14 (audit `docs/69`).
 *
 *  N1  sous le seuil, aucune moyenne ; au seuil, la moyenne au dixième ;
 *  N2  la vue produit, que lisent TOUS les affichages, passe par le seuil ;
 *  N3  aucune autre moyenne n'est calculée pour l'affichage (l'API v1, qui rend
 *      des données avec leur nombre d'avis, est la seule exception écrite) ;
 *  N4  les données structurées n'annoncent une note que si la moyenne existe.
 *
 * Chaque garde a été rougie par une mutation avant d'être crue (PR du lot 1).
 */

const RACINE = join(import.meta.dirname, "..");
const lire = (p: string) => readFileSync(join(RACINE, p), "utf8");
const sansCommentaires = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

test("N1 — sous le seuil, aucune moyenne ; au seuil, la moyenne au dixième", () => {
  assert.equal(SEUIL_NOTE_AFFICHEE, 3);
  assert.equal(noteAffichee(5, 1), null, "★ 5 (1) est le faux-précis que la règle interdit");
  assert.equal(noteAffichee(10, 2), null);
  assert.equal(noteAffichee(0, 0), null);
  assert.equal(noteAffichee(14, 3), 4.7);
  assert.equal(noteAffichee(15, 3), 5);
  assert.equal(noteAffichee(193, 40), 4.8);
  // Entrées absurdes : jamais une note inventée.
  assert.equal(noteAffichee(14, 3.5), null);
  assert.equal(noteAffichee(Number.NaN, 4), null);
  assert.equal(noteAffichee(-3, 4), null);
});

test("N2 — la vue produit passe par le seuil", () => {
  const src = sansCommentaires(lire("lib/products.ts"));
  assert.match(src, /ratingAvg:\s*noteAffichee\(r\.rating_sum,\s*r\.rating_count \?\? 0\),/);
  assert.match(src, /^import \{ noteAffichee \} from "@\/lib\/note-affichee";$/m);
});

test("N3 — aucune autre moyenne d'avis n'est calculée pour l'affichage", () => {
  const exempts = new Set(["lib/note-affichee.ts", "lib/api/v1/handlers.ts"]);
  const fichiers: string[] = [];
  const parcourir = (dir: string) => {
    for (const e of readdirSync(join(RACINE, dir))) {
      const rel = `${dir}/${e}`;
      if (statSync(join(RACINE, rel)).isDirectory()) {
        if (e !== "node_modules") parcourir(rel);
      } else if (/\.(ts|tsx)$/.test(e)) fichiers.push(rel);
    }
  };
  for (const r of ["app", "components", "lib"]) parcourir(r);
  assert.ok(fichiers.length > 200, `${fichiers.length} fichiers lus : extraction suspecte`);
  const fautifs = fichiers.filter((f) => !exempts.has(f) && /rating_sum\s*\/|\/\s*(r\.|p\.)?rating_count\b/.test(sansCommentaires(lire(f))));
  assert.deepEqual(fautifs, [], "une moyenne d'avis calculée hors du seuil");
});

test("N4 — les données structurées n'annoncent une note que si la moyenne existe", () => {
  const src = sansCommentaires(lire("lib/jsonld-produit.ts"));
  assert.match(src, /if \(p\.ratingCount > 0 && p\.ratingAvg !== null\) \{\s*produit\.aggregateRating = \{/);
});
