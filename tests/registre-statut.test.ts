import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

/**
 * LE REGISTRE DIT SON ÉTAT — et il le dit par SONDE, pas par convention.
 *
 * `zabelie_schema_migrations` (0041) codait l'état d'une migration dans
 * `sha256 = '-'`. Une convention n'est pas une donnée : elle ne se contraint
 * pas, ne s'interroge pas, et elle ne sait dire que DEUX choses là où le dépôt
 * en vit trois — `0031` est sautée à dessein.
 *
 * ⚠️ Ce fichier a d'abord accusé la convention d'avoir « menti sur `0043` ».
 * Faux : le registre était juste, c'est une sonde qui cherchait une table que
 * `0043` ne crée pas. Une erreur de mesure promue en défaut de l'objet
 * mesuré — le motif même que ces contrôles existent pour attraper.
 *
 * Ce que ce contrôle protège, et qui est plus étroit que « 0062 existe » :
 *   1. les trois états sont CONTRAINTS en base, pas conventionnels ;
 *   2. la reprise classe par sonde contre le schéma RÉEL — jamais en relisant
 *      le hash, ce qui recopierait le mensonge dans une colonne avec
 *      l'autorité d'une donnée en plus ;
 *   3. une migration sans sonde ÉCHOUE — un classement par défaut serait
 *      exactement la commodité qu'on retire ;
 *   4. il n'y a plus qu'UNE source de vérité : le script de hachage lit
 *      `statut`, plus la convention du tiret.
 */

const MIG = readFileSync("supabase/migrations/0062_registre_statut.sql", "utf8")
  .replace(/--[^\n]*/g, "");

test("les trois états sont contraints en base", () => {
  assert.match(
    MIG,
    /check \(statut in \('redigee', 'appliquee', 'abandonnee'\)\)/,
    "Sans contrainte, `statut` accepte n'importe quelle chaîne et redevient " +
      "une convention — avec une colonne en plus."
  );
  assert.match(MIG, /alter column statut set not null/);
});

test("la reprise classe par SONDE, jamais en relisant le hash", () => {
  // L'assertion porte sur ce qui COMMANDE le classement : l'exécution d'une
  // expression sondée. Chercher le mot « sonde » ne prouverait rien.
  assert.match(
    MIG,
    /execute \(select 'select ' \|\| expr from _sondes[\s\S]{0,200}into v_present/,
    "Le classement doit venir de l'ÉVALUATION d'une sonde contre le schéma."
  );
  assert.match(
    MIG,
    /case when v_present then 'appliquee' else 'redigee' end/,
    "L'état doit être dérivé du résultat de la sonde."
  );
  // Le hash ne doit intervenir NULLE PART dans la décision.
  const bloc = MIG.slice(MIG.indexOf("do $$"), MIG.indexOf("end $$"));
  assert.doesNotMatch(
    bloc,
    /sha256/,
    "Relire `sha256` pour classer figerait une convention non contrainte " +
      "dans une colonne, avec l'autorité d'une donnée en plus."
  );
});

test("une migration sans sonde fait ÉCHOUER la reprise", () => {
  assert.match(
    MIG,
    /if not exists \(select 1 from _sondes[\s\S]{0,600}raise exception 'ZB062/,
    "Un classement par défaut est exactement la commodité qui a permis à " +
      "une ligne de figurer comme classée sans qu'on ait rien vérifié."
  );
  assert.match(
    MIG,
    /select count\(\*\) into v_reste[\s\S]{0,200}raise exception 'ZB062/,
    "Post-condition : aucune ligne ne doit rester non classée."
  );
});

test("chaque migration du dépôt hors socle a sa sonde nommée", () => {
  const fichiers = readdirSync("supabase/migrations").filter((f) => /^\d{4}_.*\.sql$/.test(f));
  const horsSocle = fichiers.filter((f) => {
    const n = Number(f.slice(0, 4));
    return n >= 31 && n !== 32 && n !== 33 && n !== 34 && n !== 39 && !(n >= 41 && n <= 50) && n !== 62;
  });
  const manquantes = horsSocle.filter((f) => !MIG.includes(`'${f}'`));
  assert.deepEqual(
    manquantes,
    [],
    `Sonde absente pour : ${manquantes.join(", ")}. La reprise LÈVERA à ` +
      `l'application — mieux vaut le savoir ici qu'en production.`
  );
});

test("une seule source de vérité : le script de hachage lit `statut`", () => {
  const script = readFileSync("scripts/zabelie-migration-hash.mjs", "utf8")
    .replace(/\/\/[^\n]*/g, "");
  assert.match(
    script,
    /statut = 'appliquee'/,
    "Le garde du script doit porter sur la colonne."
  );
  assert.doesNotMatch(
    script,
    /sha256 <> '-'/,
    "Deux sources de vérité pour le même fait est le défaut que 0062 ferme."
  );
});
