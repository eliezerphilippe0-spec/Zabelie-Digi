import test from "node:test";
import assert from "node:assert/strict";
import { evaluerArrondi, MIGRATION_ARRONDI } from "../lib/rounding-probe";
import { ROUNDING_IN_FORCE } from "../lib/commission";

const AVEC = [{ filename: "0042_order_ref.sql" }, { filename: MIGRATION_ARRONDI }];
const SANS = [{ filename: "0042_order_ref.sql" }, { filename: "0041_registre.sql" }];

test("accord — la constante dit ce que le journal dit", () => {
  assert.equal(
    evaluerArrondi({ lignes: SANS, constante: "round" }).statut,
    "accord",
  );
  assert.equal(
    evaluerArrondi({ lignes: AVEC, constante: "floor" }).statut,
    "accord",
  );
});

test("désaccord grave — l'app promet `floor`, la migration n'est pas appliquée", () => {
  const r = evaluerArrondi({ lignes: SANS, constante: "floor" });
  assert.equal(r.statut, "desaccord");
  assert.equal(r.statut === "desaccord" && r.regleBase, "round");
  // C'est LE cas qui abîme quelqu'un : le vendeur voit 23, touche 22.
  assert.match(
    r.statut === "desaccord" ? r.message : "",
    /promet jusqu'à 1 HTG de plus/,
  );
});

test("désaccord bénin — la base est plus généreuse que l'annonce", () => {
  const r = evaluerArrondi({ lignes: AVEC, constante: "round" });
  assert.equal(r.statut, "desaccord");
  assert.equal(r.statut === "desaccord" && r.regleBase, "floor");
  assert.match(r.statut === "desaccord" ? r.message : "", /Sens sûr/);
});

/**
 * Le point où une sonde ment le plus volontiers : quand elle ne peut pas
 * lire. Rendre « accord » sur une lecture ratée transformerait une panne en
 * feu vert.
 */
test("lecture impossible → indéterminé, JAMAIS accord", () => {
  assert.equal(
    evaluerArrondi({ lignes: null, erreur: { message: "permission denied" } }).statut,
    "indetermine",
  );
  assert.equal(evaluerArrondi({ lignes: null }).statut, "indetermine");
  // Journal vide mais lisible : ce n'est PAS une panne — aucune migration
  // enregistrée signifie bien « 0044 pas appliquée ».
  assert.equal(evaluerArrondi({ lignes: [], constante: "round" }).statut, "accord");
});

test("sans constante explicite, la sonde juge la valeur réellement déployée", () => {
  const r = evaluerArrondi({ lignes: SANS });
  assert.equal(
    r.statut,
    ROUNDING_IN_FORCE === "round" ? "accord" : "desaccord",
    `ROUNDING_IN_FORCE='${ROUNDING_IN_FORCE}' — la sonde doit le refléter`,
  );
});
