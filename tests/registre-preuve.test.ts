import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

/**
 * LE REGISTRE COMPLET (`0063`) — CE QUI DOIT RESTER VRAI.
 *
 * `0062` a donné un `statut` aux migrations, `0063` complète les 35 lignes
 * manquantes et ajoute `preuve` : COMMENT ce statut a été établi. Trois choses
 * ont failli passer en silence pendant l'écriture, et ce fichier existe pour
 * qu'elles ne reviennent pas :
 *
 *   1. `applied_at` porte `default now()` depuis `0041`. Omettre la colonne à
 *      l'insertion datait TRENTE migrations de juillet du jour où le registre
 *      a été rempli. La relecture n'a rien vu — le SQL était correct à lire.
 *      Seule la répétition a montré la date.
 *   2. `0062` porte une sonde MORTE pour `0053` (`where key = 'retention_days'`
 *      sur une table à ligne unique qui n'a ni `key` ni `value`). Elle n'a
 *      jamais tourné, faute de ligne `0053` au registre, donc rien ne l'a
 *      signalée. `0063` l'avait recopiée telle quelle ; la répétition CI l'a
 *      fait tomber.
 *   3. La CI applique les migrations dans l'ordre des NOMS contre une base
 *      vide ; la production a 27 lignes classées et cinq dormantes. Une
 *      post-condition écrite pour un seul des deux mondes casse l'autre.
 *
 * ⚠️ CE QUE CE CONTRÔLE NE PROUVE PAS. Il lit du SQL, il ne l'exécute pas. La
 * preuve d'exécution est la suite `supabase/tests/run.sh`, qui joue vraiment
 * `0063`, et la répétition sur socle prod-conforme. Les deux sont nécessaires.
 */

const DIR = "supabase/migrations";
const MIG = readFileSync(`${DIR}/0063_registre_complet.sql`, "utf8");
/** Le SQL exécutable seul : sans ça, une assertion peut être satisfaite par un commentaire. */
const SQL = MIG.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, "");

test("l'insertion passe `applied_at` EXPLICITEMENT, jamais par défaut", () => {
  // L'assertion porte sur la LISTE DE COLONNES et sur le `null` qui lui
  // correspond — pas sur le mot « applied_at », qui traîne partout ailleurs
  // dans le fichier et resterait présent si l'insertion cessait de le passer.
  assert.match(
    SQL,
    /insert into zabelie_schema_migrations\s*\(\s*filename,\s*sha256,\s*statut,\s*preuve,\s*applied_at,\s*applied_by,\s*note\s*\)\s*select\s+filename,\s*sha256,\s*statut,\s*preuve,\s*null\s*,/,
    "L'insertion doit nommer `applied_at` et lui passer NULL. Sans ça, le " +
      "`default now()` de 0041 date les migrations du socle du jour où le " +
      "registre a été rempli — une date inventée, et parfaitement crédible."
  );
});

test("aucune valeur n'est la CHAÎNE 'null'", () => {
  /* Trouvé en relisant le fichier généré, pas par la répétition : le
   * générateur passait `null` à sa fonction de citation, qui rendait
   * fidèlement `'null'` — une chaîne de quatre lettres. Les 49 notes en
   * étaient remplies, les quatre répétitions étaient vertes, la suite SQL
   * aussi. Rien n'assertait sur `note`, donc rien ne pouvait le voir.
   *
   * C'est le motif du dépôt une fois de plus : la faute ne casse rien, ne
   * lève rien, et se lit comme une valeur ordinaire dans un `select`. */
  assert.doesNotMatch(
    SQL,
    /,\s*'null'\s*[,)]/,
    "Une valeur vaut la chaîne 'null' au lieu de SQL NULL. Un `is null` ne " +
      "la trouvera jamais, et elle s'affiche comme une donnée légitime."
  );
});

test("la sonde de 0053 vise la vraie colonne, pas le couple clé/valeur", () => {
  assert.doesNotMatch(
    SQL,
    /zabelie_search_config\s+where\s+key\s*=/,
    "`zabelie_search_config` est une table à LIGNE UNIQUE : ni colonne `key`, " +
      "ni colonne `value`. C'est la sonde morte que 0062 porte encore, et " +
      "qu'aucune exécution n'avait pu signaler."
  );
  assert.match(SQL, /zabelie_search_config\s+where\s+retention_days\s*=\s*90/);
});

test("la table de sondes n'est pas détruite au commit", () => {
  // Même piège que 0062 : `psql` est en autocommit, `on commit drop` tue la
  // table à la fin de l'instruction qui la crée, et l'`insert` suivant ne
  // trouve rien. La CI l'avait appris à ses dépens.
  assert.doesNotMatch(SQL, /create temporary table\s+_registre[^;]*on commit drop/i);
  assert.match(SQL, /drop table _registre;/);
});

test("une sonde fausse fait ÉCHOUER la migration, ligne par ligne", () => {
  // La condition qui commande le refus, pas le libellé de l'erreur : un
  // `if (false)` laisserait le message ZB063 intact dans le fichier.
  assert.match(
    SQL,
    /if not coalesce\(v_present, false\) then[\s\S]{0,200}raise exception 'ZB063/,
    "Le refus doit être commandé par une sonde fausse. Une boucle qui " +
      "exigerait « au moins une sonde vraie » resterait verte avec cinq fausses."
  );
});

test("les comptes exacts ne sont exigés QUE hors CI", () => {
  // Le discriminant est le registre interne de Supabase, absent en CI. Sans
  // cette garde, `sql-tests` casse au premier passage — les cinq dormantes
  // sont appliquées là-bas et le compte 56/5/1 y est faux.
  const zone = SQL.slice(SQL.indexOf("v_pj integer"));
  assert.match(
    zone,
    /if to_regclass\('supabase_migrations\.schema_migrations'\) is null then[\s\S]{0,300}return;/,
    "Les comptes de production doivent être sautés quand le journal interne " +
      "est absent, sinon la migration ne peut pas tourner en CI."
  );
  assert.match(zone, /\(56, 5, 1\)/);
  assert.match(zone, /\(49, 6, 1, 6\)/);
});

test("`statut` et `preuve` ne peuvent pas diverger", () => {
  assert.match(
    SQL,
    /check \(\(statut = 'appliquee'\) = \(preuve <> 'non_appliquee'\)\)/,
    "Sans ce lien, une ligne pourrait être `redigee` avec une preuve " +
      "d'application, ou `appliquee` sans rien pour l'étayer."
  );
});

test("la liste de 0063 couvre TOUS les fichiers jusqu'à 0062 — aucun oubli", () => {
  /* LE CROISEMENT QUI COMPTE. `0063` porte une liste de 62 noms de fichiers,
   * écrite à la main. Un fichier absent de cette liste et présent sur le
   * disque ne lèverait rien à l'application — la migration vérifie le
   * registre contre SA liste, pas contre le dépôt. C'est exactement la classe
   * « artefact adressé par CHAÎNE » que `tsc` ne verra jamais. */
  const surDisque = readdirSync(DIR)
    .filter((f) => /^\d{4}_.*\.sql$/.test(f))
    .filter((f) => Number(f.slice(0, 4)) <= 62)
    .sort();
  const dansLaListe = new Set(
    [...SQL.matchAll(/\('(\d{4}_[a-z0-9_]+\.sql)'/g)].map((m) => m[1])
  );
  const oublies = surDisque.filter((f) => !dansLaListe.has(f));
  assert.deepEqual(
    oublies,
    [],
    `Fichiers de migration absents de la liste de 0063 : ${oublies.join(", ")}. ` +
      `Le registre se dirait complet en ne l'étant pas.`
  );
  assert.equal(
    surDisque.length,
    62,
    `${surDisque.length} fichiers ≤ 0062 sur le disque, 62 attendus — un ` +
      `fichier a été ajouté, supprimé ou renommé sous la liste de 0063.`
  );
});
