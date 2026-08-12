import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * `applied_by` — CE QUE `0064` DOIT CONTINUER DE GARANTIR.
 *
 * La colonne dit QUI a autorisé une application. Quinze lignes y portaient
 * `postgres`, qui est le rôle de connexion : la même valeur pour tout le
 * monde, donc zéro information, mais placée là où un lecteur attend une
 * réponse. Une colonne vide se remarque ; une colonne uniformément remplie ne
 * se remarque pas.
 *
 * ⚠️ LE VRAI RISQUE N'ÉTAIT PAS DE RATER LA REQUALIFICATION, C'ÉTAIT DE LA
 * RÉUSSIR TROP BIEN. Un `update` en bloc aurait rangé `0055_admin_audit.sql`
 * sous « non renseigné » — alors que c'est la SEULE ligne dont la provenance
 * soit connue à la seconde, et que cette provenance est l'incident qui a fait
 * écrire la règle dure n°5. L'outil chargé de porter la mémoire de la faute
 * l'aurait effacée, et le résultat aurait eu l'air propre.
 *
 * ⚠️ CE QUE CE CONTRÔLE NE PROUVE PAS. Il lit le SQL, il ne l'exécute pas.
 * Que la base soit dans l'état voulu se mesure en base, et c'est consigné dans
 * `OPS_TODO.md` avec la requête qui l'établit.
 */

const SQL = readFileSync("supabase/migrations/0064_applied_by_requalifie.sql", "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/--[^\n]*/g, "");

test("le cas nommé passe AVANT le cas général", () => {
  /* L'assertion porte sur l'ORDRE des deux `update`, qui est ce qui commande
   * le résultat — pas sur la présence des deux, qui serait vraie même inversés
   * et donnerait le nivellement exact qu'on veut interdire. */
  const iNomme = SQL.indexOf("filename = '0055_admin_audit.sql'");
  const iGeneral = SQL.search(/set applied_by = 'non renseigne \(anterieur a regle 5\)'/);
  assert.ok(iNomme > 0, "l'update nommé de 0055 est introuvable");
  assert.ok(iGeneral > 0, "l'update général est introuvable");
  assert.ok(
    iNomme < iGeneral,
    "Le cas général s'exécuterait AVANT le cas nommé et l'écraserait : `0055` " +
      "tomberait dans le fourre-tout, et c'est précisément la ligne dont la " +
      "provenance est connue à la seconde."
  );
});

test("le cas général ne vise QUE le rôle de connexion", () => {
  // Un `update` sans `where applied_by = 'postgres'` réécrirait aussi les
  // douze lignes `porteur (session assistee)` — de vraies traces, détruites
  // par un filet trop large.
  assert.match(
    SQL,
    /set applied_by = 'non renseigne \(anterieur a regle 5\)'\s*where applied_by = 'postgres'/,
    "Le cas général doit être borné à `applied_by = 'postgres'`."
  );
});

test("une ligne restée au rôle de connexion fait ÉCHOUER la migration", () => {
  assert.match(
    SQL,
    /select count\(\*\) into v_reste[\s\S]{0,200}applied_by = 'postgres'[\s\S]{0,200}raise exception 'ZB064/,
    "La post-condition doit être commandée par un comptage, pas seulement écrite."
  );
});

test("l'aplatissement de 0055 est un ÉCHEC, pas un détail", () => {
  /* La condition qui commande le refus, pas le libellé : un `if false` ou une
   * comparaison inversée laisserait le message ZB064 intact dans le fichier.
   * Formulée pour tenir dans les deux mondes — en CI `0055` porte ce que
   * `0063` lui a donné, et ce n'est pas le fourre-tout non plus. */
  assert.match(
    SQL,
    /if v_0055 = 'non renseigne \(anterieur a regle 5\)' then[\s\S]{0,400}raise exception\s*\n?\s*'ZB064/,
    "Le garde doit refuser que `0055` porte la valeur générique."
  );
});

test("le rôle de connexion est interdit pour l'avenir", () => {
  assert.match(
    SQL,
    /check \(applied_by is null or applied_by <> 'postgres'\)/,
    "Sans contrainte, la même valeur reviendra à la prochaine inscription " +
      "écrite de mémoire — et elle se relira comme une réponse."
  );
});

test("aucune provenance n'est reconstituée pour les quatorze autres", () => {
  /* LE CROISEMENT QUI COMPTE ICI. La tentation, en écrivant cette migration,
   * était de reconstituer les signaux « probables » des autres lignes. Une
   * provenance se lit dans une trace, jamais dans un souvenir — c'est la règle
   * appliquée à `0044` le 2026-08-12. Le contrôle : aucune valeur nominative
   * ne doit apparaître en dehors du cas `0055`, seul documenté. */
  const nominatives = [...SQL.matchAll(/applied_by = '([^']+)'/g)]
    .map((m) => m[1])
    .filter((v) => v !== "postgres")
    .filter((v) => v !== "non renseigne (anterieur a regle 5)")
    .filter((v) => !v.startsWith("agent (sans signal porteur"));
  assert.deepEqual(
    nominatives,
    [],
    `Provenance(s) attribuée(s) sans trace citable : ${nominatives.join(", ")}. ` +
      `Seul \`0055\` a une provenance documentée (CLAUDE.md, règle 5).`
  );
});
