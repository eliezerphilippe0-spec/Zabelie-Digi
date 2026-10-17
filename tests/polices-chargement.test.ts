import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * LES POLICES NE RETARDENT PLUS LE PREMIER AFFICHAGE (mesure du 2026-10-17).
 *
 * Sur zabelie.com, en mobile 360 px, 4G lente et processeur ×4, quatre rondes
 * entrelacées : préchargées dans l'en-tête `Link`, Inter et Manrope passaient
 * avant les feuilles de style — premier affichage à 2,1 s ; sans
 * préchargement, 0,86 s. Le préchargement est le réglage PAR DÉFAUT de
 * next/font : il revient tout seul si l'option disparaît.
 */
const LAYOUT = readFileSync("app/layout.tsx", "utf8");
const bloc = (debut: string) => LAYOUT.slice(LAYOUT.indexOf(debut), LAYOUT.indexOf("});", LAYOUT.indexOf(debut)));

test("C1 — aucune des deux polices n'est préchargée", () => {
  for (const d of ["const inter = localFont({", "const manrope = Manrope({"]) {
    assert.match(bloc(d), /preload: false,/, `${d} est de nouveau préchargée`);
  }
});

test("C2 — les deux polices restent en swap : la marque s'affiche dès la première visite", () => {
  /* `optional` sans préchargement laissait les titres dans leur police de
   * repli à chaque première visite, même sur fibre (vu au rendu le
   * 2026-10-17), pour 0,2 s de gain. */
  for (const d of ["const inter = localFont({", "const manrope = Manrope({"]) {
    assert.match(bloc(d), /display: "swap",/, `${d} n'est plus en swap`);
  }
});
