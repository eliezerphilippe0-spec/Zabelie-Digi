import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ancetresZone, sousArbre, zonesRecouvrantes, type ZoneNode } from "../lib/zones";
import { DICT, LANGS } from "../lib/i18n";

/**
 * Le filtre « Zone » du catalogue inclut les vendeurs qui DÉCLARENT livrer dans la
 * zone (docs/77 §8, 0158). Décision du porteur (2026-10-29) : « les vendeurs
 * auront à faire leur propre livraison » — être installé ailleurs ne doit pas
 * cacher un vendeur qui sert la zone.
 *
 * Règle de recouvrement : un vendeur correspond à la zone filtrée Z s'il déclare Z,
 * une zone DANS Z (il en sert une partie), ou une zone qui CONTIENT Z (il sert tout
 * le département). Un quartier frère ne correspond pas.
 */

const N = (id: string, parent: string | null): ZoneNode => ({ id, parent_id: parent });
const ZONES: ZoneNode[] = [
  N("d-nord", null), N("d-ouest", null),
  N("k-okap", "d-nord"), N("k-limbe", "d-nord"),
  N("q-carenage", "k-okap"), N("q-hautcap", "k-okap"),
];

test("ancetresZone : du plus proche au plus lointain, sans la zone elle-même", () => {
  assert.deepEqual(ancetresZone(ZONES, "q-carenage"), ["k-okap", "d-nord"]);
  assert.deepEqual(ancetresZone(ZONES, "k-okap"), ["d-nord"]);
});

test("ancetresZone : connus-négatifs — une racine, une zone inconnue, un cycle", () => {
  assert.deepEqual(ancetresZone(ZONES, "d-nord"), []);
  assert.deepEqual(ancetresZone(ZONES, "fantome"), []);
  const cyclique: ZoneNode[] = [N("a", "b"), N("b", "a")];
  assert.deepEqual(ancetresZone(cyclique, "a"), ["b"], "un cycle termine, sans boucler ni répéter la zone");
});

test("recouvrement : une commune — elle-même, ses quartiers, son département", () => {
  const r = zonesRecouvrantes(ZONES, "k-okap").sort();
  assert.deepEqual(r, ["d-nord", "k-okap", "q-carenage", "q-hautcap"]);
});

test("recouvrement : connus-négatifs — l'autre commune, l'autre département, le quartier FRÈRE", () => {
  const okap = zonesRecouvrantes(ZONES, "k-okap");
  assert.equal(okap.includes("k-limbe"), false, "un vendeur qui ne dessert que Limbé ne sert pas Cap-Haïtien");
  assert.equal(okap.includes("d-ouest"), false);
  const carenage = zonesRecouvrantes(ZONES, "q-carenage");
  assert.deepEqual(carenage.sort(), ["d-nord", "k-okap", "q-carenage"]);
  assert.equal(carenage.includes("q-hautcap"), false, "un vendeur qui ne dessert que Haut-du-Cap ne sert pas Carénage");
});

test("recouvrement : un département — lui-même et tout son sous-arbre, aucun ancêtre", () => {
  assert.deepEqual(zonesRecouvrantes(ZONES, "d-nord").sort(), [...sousArbre(ZONES, "d-nord")].sort());
});

test("recouvrement : une zone inconnue ne recouvre qu'elle-même (le filtre rendra zéro, jamais tout)", () => {
  assert.deepEqual(zonesRecouvrantes(ZONES, "fantome"), ["fantome"]);
});

// ───────────────────────── câblage ────────────────────────────────────────────

const ZONES_TS = readFileSync("lib/zones.ts", "utf8");
const SANS_COMMENTAIRES = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const CODE = SANS_COMMENTAIRES(ZONES_TS);
const CATALOGUE = readFileSync("app/catalogue/page.tsx", "utf8");

test("filtre zone : les vendeurs qui desservent la zone sont lus, puis réunis aux vendeurs installés sans doublon", () => {
  assert.match(CODE, /\.from\("zabelie_seller_service_zones"\)\s*\.select\("seller_id"\)\s*\.in\("zone_id", zoneIds\)/);
  assert.match(CODE, /const desservants = await vendeursDesservant\(supabase, zonesRecouvrantes\(zones as ZoneNode\[\], zoneId\)\);\s*return \[\.\.\.new Set\(\[\.\.\.installes, \.\.\.desservants\]\)\];/);
});

test("filtre zone : une table absente ne journalise pas, une autre erreur le fait, et les deux se replient sur les installés", () => {
  assert.match(CODE, /if \(error \|\| !data\) \{\s*if \(error && !isMissingTable\(error\)\) console\.warn\([^;]*\);\s*return \[\];\s*\}/);
});

test("filtre zone : la lecture des vendeurs installés passe toujours par la fonction 0084 (lecture directe de zone_id refusée)", () => {
  assert.match(CODE, /supabase\.rpc\(\s*"zabelie_vande_nan_zon"/);
});

test("catalogue : la note ne s'affiche que sous un filtre actif, hors univers numérique", () => {
  assert.match(CATALOGUE, /\{zoneActive && universe !== "numerique" \? \(\s*<p[^>]*>\{t\(lang, "zone\.filter\.note"\)\}<\/p>\s*\) : null\}/);
});

test("libellé de la note : quatre langues, et elle rappelle que Zabelie ne livre pas", () => {
  const nonLivraison = { fr: /ne livre pas/i, ht: /pa livre/i, en: /does not deliver/i, es: /no entrega/i } as const;
  for (const lang of LANGS) {
    const note = DICT[lang]["zone.filter.note" as keyof typeof DICT.fr];
    assert.ok(note && note.trim().length > 20, `${lang} : zone.filter.note vide`);
    assert.match(note, nonLivraison[lang], `${lang} : la note ne rappelle pas que Zabelie ne livre pas`);
  }
});
