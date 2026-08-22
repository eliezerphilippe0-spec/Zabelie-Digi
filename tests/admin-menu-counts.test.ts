import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { refus } from "./refus-forme";

/**
 * Les badges du menu admin et la route qui les compte disent la MÊME chose.
 *
 * Deux moitiés qui vivent dans deux fichiers : /api/admin/menu-counts calcule
 * des clés, components/admin/menu-badges les affiche. Un compteur calculé que
 * personne n'affiche est du travail mort ; un badge dont la clé a disparu de
 * la route affiche silencieusement zéro POUR TOUJOURS — la file paraît vide
 * alors qu'elle déborde, c'est le pire mensonge possible pour un back-office.
 * Aucune des deux dérives ne casse une compilation : seul un croisement les
 * voit (même motif que tests/crons-appelants.test.ts).
 *
 * Le croisement lit les SOURCES : la route est inimportable ici (next/server,
 * client Supabase à l'import), même limite assumée que home-empty-state.
 */

const ROUTE = readFileSync("app/api/admin/menu-counts/route.ts", "utf8");
const BADGES = readFileSync("components/admin/menu-badges.tsx", "utf8");

/** Clés renvoyées par la route — la ligne NextResponse.json({ ... }) finale. */
function clesRoute(src: string): string[] {
  const m = src.match(/NextResponse\.json\(\{ ([a-z_, ]+) \}\)/);
  return m ? m[1].split(",").map((s) => s.trim()).filter(Boolean) : [];
}

/** Clés consommées par les badges — les valeurs `cle:` non nulles du menu. */
function clesBadges(src: string): string[] {
  return [...src.matchAll(/cle: "([a-z_]+)"/g)].map((m) => m[1]);
}

test("l'extraction lit bien les deux fichiers (l'instrument avant la mesure)", () => {
  // Un extracteur qui rend [] rendrait les tests suivants verts sans rien
  // vérifier. Connu-positif sur corpus synthétique :
  assert.deepEqual(clesRoute('return NextResponse.json({ a, b });'), ["a", "b"]);
  assert.deepEqual(clesBadges('{ label: "X", href: "/x", cle: "a" }'), ["a"]);
  // Et sur le dépôt réel :
  assert.ok(clesRoute(ROUTE).length >= 3, `route : ${clesRoute(ROUTE).length} clé(s) lue(s)`);
  assert.ok(clesBadges(BADGES).length >= 3, `badges : ${clesBadges(BADGES).length} clé(s) lue(s)`);
});

test("chaque clé comptée est affichée, chaque badge a sa source", () => {
  const route = clesRoute(ROUTE).sort();
  const badges = clesBadges(BADGES).sort();
  assert.deepEqual(
    badges,
    route,
    "Dérive route ↔ badges. Un compteur sans badge est du travail mort ; un " +
      "badge sans compteur affiche zéro pour toujours et fait passer une file " +
      "pleine pour une file vide."
  );
});

test("la route refuse un non-admin AVANT tout comptage", () => {
  const garde = ROUTE.indexOf('user.role !== "admin"');
  const comptage = ROUTE.indexOf("createAdminClient()");
  assert.ok(garde > -1, "garde rôle absente de la route");
  assert.ok(comptage > -1, "comptage absent de la route");
  assert.ok(
    garde < comptage,
    "la garde doit précéder la création du client service role — un non-admin " +
      "ne déclenche aucune requête, pas même un count"
  );
  /* ⚠️ La CONDITION, plus le seul littéral : `/status: 403/` flottait, et un
   * garde rendu inatteignable (`if (false)`) l'aurait laissé vert. */
  assert.match(ROUTE, new RegExp(`user\\.role !== "admin"[\\s\\S]{0,160}${refus(403)}`));
});
