import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

/**
 * LE GARDE DE REJEU (`0065`) — ET LE PIÈGE DE SON PROPRE CONTRÔLE.
 *
 * À partir de `0066`, chaque migration doit appeler
 * `zabelie_migration_garde('<son propre nom>')` en PREMIÈRE instruction
 * exécutable. Trois façons de rater ça, et elles ne se ressemblent pas :
 *
 *   1. l'appel manque — le plus visible, et le moins probable ;
 *   2. l'appel porte le nom d'une AUTRE migration (copié-collé du fichier
 *      précédent). Le garde s'exécute, ne trouve rien d'anormal, et laisse
 *      passer : **fail-open silencieux**. C'est la classe « artefact adressé
 *      par CHAÎNE » — `tsc` ne verra jamais rien, par construction ;
 *   3. l'appel n'est pas en tête. Appliquée par `psql`, chaque instruction est
 *      sa propre transaction : tout ce qui précède est déjà COMMITÉ quand le
 *      garde lève.
 *
 * ⚠️ ET LE PIÈGE DE CE FICHIER-CI. Aucune migration `0066+` n'existe encore.
 * Un contrôle qui se contenterait de balayer le disque passerait donc au vert
 * en ne regardant RIEN — « aucun cas » et « aucun cas possible » rendent le
 * même silence, et c'est exactement le défaut que `CLAUDE.md` décrit sous
 * « un filet sur un chemin impraticable mesure zéro — et paraît sain ».
 *
 * D'où la forme : la règle est une FONCTION PURE, éprouvée sur des cas
 * synthétiques connus-positifs ET connus-négatifs, puis appliquée au disque.
 * Le jour où `0066` arrive, le balayage a déjà démontré qu'il sait échouer.
 */

const DIR = "supabase/migrations";
/** Numéro à partir duquel le garde est exigé. `0065` crée la fonction. */
const DEPUIS = 66;

/** SQL exécutable seul : sans ça, un appel en commentaire suffirait. */
function executable(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, "").trim();
}

/**
 * Rend le défaut trouvé, ou `null`. Fonction PURE : c'est elle qu'on éprouve,
 * pas le balayage.
 */
export function defautDeGarde(nomFichier: string, sql: string): string | null {
  const code = executable(sql);
  const premier = /^select\s+zabelie_migration_garde\(\s*'([^']*)'\s*\)\s*;/i.exec(code);
  if (!premier) {
    const ailleurs = /zabelie_migration_garde\(\s*'([^']*)'\s*\)/i.exec(code);
    return ailleurs
      ? `l'appel au garde existe mais n'est pas la PREMIÈRE instruction exécutable`
      : `aucun appel à zabelie_migration_garde`;
  }
  if (premier[1] !== nomFichier) {
    return `le garde porte '${premier[1]}' au lieu de '${nomFichier}' — il surveillerait une AUTRE migration et laisserait passer celle-ci`;
  }
  return null;
}

const GARDE_OK = (f: string) => `select zabelie_migration_garde('${f}');\n\ncreate table x (id int);\n`;

test("cas connu-POSITIF : un garde correct passe", () => {
  assert.equal(defautDeGarde("0066_ma_migration.sql", GARDE_OK("0066_ma_migration.sql")), null);
});

test("cas connu-POSITIF : un en-tête de commentaires ne gêne pas", () => {
  const avec = `-- ====\n-- 0066 — titre\n-- ====\n/* bloc */\n${GARDE_OK("0066_ma_migration.sql")}`;
  assert.equal(defautDeGarde("0066_ma_migration.sql", avec), null);
});

test("cas connu-NÉGATIF : garde absent", () => {
  assert.match(
    defautDeGarde("0066_ma_migration.sql", "create table x (id int);") ?? "",
    /aucun appel/
  );
});

test("cas connu-NÉGATIF : garde portant le nom d'une AUTRE migration", () => {
  // Le copié-collé du fichier précédent. Le plus dangereux des trois : le SQL
  // est valide, le garde s'exécute, et il ne garde rien.
  const faux = GARDE_OK("0065_garde_de_rejeu.sql");
  assert.match(
    defautDeGarde("0066_ma_migration.sql", faux) ?? "",
    /porte '0065_garde_de_rejeu\.sql' au lieu de '0066_ma_migration\.sql'/
  );
});

test("cas connu-NÉGATIF : garde présent mais pas en tête", () => {
  const tardif = `create table x (id int);\nselect zabelie_migration_garde('0066_ma_migration.sql');\n`;
  assert.match(defautDeGarde("0066_ma_migration.sql", tardif) ?? "", /PREMIÈRE instruction/);
});

test("cas connu-NÉGATIF : un appel en COMMENTAIRE ne compte pas", () => {
  // Sans le retrait des commentaires, l'exemple d'usage écrit dans un en-tête
  // suffirait à satisfaire le contrôle.
  const commente = `-- select zabelie_migration_garde('0066_ma_migration.sql');\ncreate table x (id int);\n`;
  assert.match(defautDeGarde("0066_ma_migration.sql", commente) ?? "", /aucun appel/);
});

test("le garde lui-même repose sur une CONDITION, pas sur un message", () => {
  /* ÉCRIT APRÈS UN VERT QUI NE VOULAIT RIEN DIRE. Ce fichier ne surveillait
   * que les sites d'appel : passé sous la mutation qui remplace
   * `if v_statut = 'appliquee'` par `if false`, il est resté VERT. Un garde
   * rendu inatteignable laisse exactement le même texte dans les fichiers
   * appelants — c'est la cécité de sous-chaîne de `CLAUDE.md`, déplacée d'un
   * cran : ici, ce n'est pas le libellé qui trompe, c'est le fait de regarder
   * le mauvais fichier.
   *
   * ⚠️ Cette assertion reste de la LECTURE DE TEXTE. La preuve d'exécution est
   * `supabase/tests/migration_garde.test.sql`, qui appelle vraiment la
   * fonction et rougit sur `if false`. Les deux sont nécessaires : celle-ci
   * échoue en une seconde sur un poste, l'autre exige une base. */
  const src = readFileSync(`${DIR}/0065_garde_de_rejeu.sql`, "utf8").replace(/--[^\n]*/g, "");
  assert.match(
    src,
    /if\s+v_statut\s*=\s*'appliquee'\s+then[\s\S]{0,400}raise\s+exception/i,
    "Le refus doit être commandé par `v_statut = 'appliquee'`. Le message " +
      "ZB065 seul survit intact à un `if false`."
  );
  assert.match(
    src,
    /select\s+statut\s+into\s+v_statut[\s\S]{0,200}zabelie_schema_migrations/i,
    "Sans lecture du registre, la condition ne peut rien commander."
  );
});

test("la fonction que ce contrôle EXIGE est bien créée quelque part", () => {
  /* L'inverse du « code sans appelant » : ici, un appelant imposé à toutes les
   * migrations futures, sans personne pour créer la fonction. Le jour où
   * `0065` serait renommée ou retirée, chaque migration gardée casserait à
   * l'application — et rien, sans ce croisement, ne l'aurait signalé. */
  const cree = readdirSync(DIR)
    .filter((f) => f.endsWith(".sql"))
    .some((f) =>
      /create\s+(or\s+replace\s+)?function\s+zabelie_migration_garde\s*\(/i.test(
        readFileSync(`${DIR}/${f}`, "utf8")
      )
    );
  assert.ok(cree, "aucune migration ne crée `zabelie_migration_garde`");
});

test(`chaque migration ≥ ${DEPUIS} porte son garde`, () => {
  const concernees = readdirSync(DIR)
    .filter((f) => /^\d{4}_.*\.sql$/.test(f))
    .filter((f) => Number(f.slice(0, 4)) >= DEPUIS)
    .sort();

  const defauts = concernees
    .map((f) => [f, defautDeGarde(f, readFileSync(`${DIR}/${f}`, "utf8"))] as const)
    .filter(([, d]) => d !== null)
    .map(([f, d]) => `${f} : ${d}`);

  assert.deepEqual(defauts, [], `Migrations sans garde valide :\n  ${defauts.join("\n  ")}`);

  /* LA VACUITÉ EST DITE, PAS TUE. Tant qu'aucune migration ≥ 0066 n'existe,
   * ce balayage ne regarde rien — et un vert qui ne regarde rien est le motif
   * central de ce dépôt. Ce qui porte la garantie aujourd'hui, ce sont les six
   * cas synthétiques ci-dessus ; ce balayage prend le relais au premier
   * fichier. L'assertion ci-dessous n'échoue jamais : elle existe pour que le
   * compte apparaisse dans la sortie du test. */
  assert.ok(
    concernees.length >= 0,
    `migrations examinées : ${concernees.length}` +
      (concernees.length === 0 ? " — balayage VIDE, la garantie vient des cas synthétiques" : "")
  );
});

test("`0065` est la dernière non gardée, et c'est mécanique", () => {
  // Elle CRÉE la fonction : elle ne peut pas s'appeler elle-même. Si un jour
  // elle portait un garde, c'est que quelqu'un a déplacé la création — et ce
  // quelqu'un doit revoir `DEPUIS`.
  const src = readFileSync(`${DIR}/0065_garde_de_rejeu.sql`, "utf8");
  assert.equal(
    defautDeGarde("0065_garde_de_rejeu.sql", src),
    "aucun appel à zabelie_migration_garde",
    "`0065` crée la fonction ; elle ne peut pas être gardée par elle."
  );
});
