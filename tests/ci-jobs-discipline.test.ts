import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * Les noms des jobs CI sont un CONTRAT avec la protection de branche.
 *
 * POURQUOI
 * --------
 * Un « check requis » se désigne dans les réglages GitHub par le NOM DU JOB,
 * une chaîne recopiée à la main dans une interface web. Le jour où un job est
 * renommé, la protection reste affichée comme active, sa liste garde un nom
 * qui ne correspond plus à rien, et PLUS RIEN NE BLOQUE. Aucun message, aucun
 * rouge : le réglage a l'air en place et ne l'est plus.
 *
 * Même classe de défaut que le doublon `push` + `synchronize` corrigé en
 * 61c4c99 : quelque chose qui disparaît sans bruit. L'absence de signal doit
 * être un signal (CLAUDE.md).
 *
 * DEUX FAÇONS DE CASSER LE RÉGLAGE, PAS UNE
 * ------------------------------------------
 *   1. renommer la clé YAML du job ;
 *   2. AJOUTER un `name:` au niveau du job. Aucun job n'en porte aujourd'hui,
 *      donc GitHub retombe sur la clé YAML. Ajouter un `name:` ne touche pas
 *      à l'identifiant, a l'air purement cosmétique, et change pourtant le nom
 *      du check. C'est la plus insidieuse des deux.
 *
 * Le test couvre les deux.
 *
 * LIMITE ASSUMÉE
 * --------------
 * Le dépôt n'a aucune dépendance de parsing YAML et la règle projet interdit
 * d'en ajouter une sans validation. Le test lit donc la SOURCE, comme
 * `product-kind-discipline` et `ancres-navigation`. Il vérifie que le fichier
 * DÉCLARE les bons noms, pas que GitHub les expose — cette seconde moitié
 * n'est vérifiable que dans les réglages du dépôt, à la main.
 *
 * ⚠️ Ce test n'est PAS une interdiction de renommer un job. C'est une
 * obligation de le faire en connaissance de cause : le rendre rouge oblige à
 * ouvrir ce fichier, qui dit d'aller mettre à jour la protection de branche.
 * Mettre à jour la liste ci-dessous SANS toucher au réglage GitHub, c'est
 * remettre le défaut en place — et le commentaire est là pour l'empêcher.
 */

/** Noms exposés à GitHub, et donc recopiables en « checks requis ». */
const JOBS_ATTENDUS = ["build", "e2e", "sql-tests"];

const CI = readFileSync(".github/workflows/ci.yml", "utf8");

/** Le bloc `jobs:` — de sa déclaration jusqu'à la prochaine clé de 1er niveau. */
function blocJobs(): string {
  const debut = CI.search(/^jobs:$/m);
  assert.notEqual(debut, -1, "`jobs:` introuvable dans ci.yml");
  const reste = CI.slice(debut + "jobs:".length);
  const suivante = reste.search(/^[a-zA-Z]/m);
  return suivante === -1 ? reste : reste.slice(0, suivante);
}

test("les jobs CI portent exactement les noms attendus", () => {
  // Clés de job : deux espaces d'indentation, rien d'autre sur la ligne.
  const trouves = [...blocJobs().matchAll(/^ {2}([a-zA-Z0-9_-]+):\s*$/gm)].map(
    (m) => m[1]
  );
  assert.deepEqual(
    [...trouves].sort(),
    [...JOBS_ATTENDUS].sort(),
    "Les jobs de ci.yml ne correspondent plus à la liste attendue. Un check " +
      "requis se désigne par le nom du job : un job renommé, ajouté ou " +
      "supprimé cesse silencieusement d'être exigé par la protection de " +
      "branche, qui reste pourtant affichée comme active. Mettre à jour la " +
      "protection dans les réglages GitHub, PUIS cette liste — jamais " +
      "l'inverse."
  );
});

test("aucun job ne porte de `name:` qui masquerait sa clé", () => {
  // Propriété de job = 4 espaces. Un nom d'étape est plus profond et précédé
  // d'un tiret (`      - name:`), il n'est donc pas capté ici.
  const masques = [...blocJobs().matchAll(/^ {4}name:\s*(.+)$/gm)].map((m) =>
    m[1].trim()
  );
  assert.deepEqual(
    masques,
    [],
    `Un \`name:\` a été ajouté au niveau d'un job (${masques.join(", ")}). ` +
      "GitHub expose alors CE nom au lieu de la clé YAML : le check requis " +
      "configuré sur l'ancien nom cesse d'exister, sans aucune alerte. Le " +
      "changement a l'air cosmétique et casse la protection de branche."
  );
});
