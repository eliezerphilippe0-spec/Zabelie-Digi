import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";

/**
 * UN NUMÉRO DE MIGRATION QUI MANQUE NE FAIT AUCUN BRUIT.
 *
 * L'histoire qui produit ce fichier. Le 2026-08-11, en croisant la base et le
 * dépôt, `0055_admin_audit.sql` s'est révélée APPLIQUÉE en production —
 * `zabelie_admin_actions` bien présente — alors que le fichier n'est nulle
 * part dans `main` : il vit sur la branche de la PR #88, restée ouverte. La
 * base portait donc une table qu'aucun code déployé n'alimentait, et rien,
 * absolument rien, ne l'a signalé pendant vingt-quatre heures. `ls` rendait
 * `…0054 0057 0058` et personne ne lit un trou.
 *
 * C'est le pendant exact du « code sans appelant » de `crons-appelants` :
 * là-bas une fonction que rien n'invoquait, ici un objet dont le fichier
 * n'existe pas. Même angle mort, autre bout — dans les deux cas le défaut est
 * une ABSENCE, et une absence ne lève pas d'erreur.
 *
 * Ce que le contrôle vérifie : les numéros de `supabase/migrations/` forment
 * une suite CONTIGUË à partir de `0001`. Tout trou échoue, sauf s'il est
 * inscrit ci-dessous avec sa raison.
 *
 * ⚠️ LES EXEMPTIONS SE PÉRIMENT DANS LES DEUX SENS. Une liste qui ne sait que
 * grandir devient une conformité par usure : au bout d'un an elle contient
 * tout, et le contrôle ne contrôle plus rien. Le test échoue donc AUSSI quand
 * un numéro exempté a gagné son fichier — l'exemption doit alors être retirée
 * dans le même geste que la fusion.
 *
 * ⚠️ CE QUE CE CONTRÔLE NE PROUVE PAS. Il prouve qu'un fichier existe, pas
 * qu'il est appliqué, ni qu'il est correct. La preuve d'application se lit en
 * base — `zabelie_schema_migrations` croisé avec la PRÉSENCE RÉELLE des objets
 * que la migration crée, jamais avec un nom d'objet retenu de mémoire (le même
 * 2026-08-11, `0043` a été déclarée « non appliquée » sur l'absence de
 * `zabelie_shipments`, une table que `0043` ne crée pas : elle crée
 * `zabelie_fulfillment`, présente depuis deux jours).
 */

const DIR = "supabase/migrations";

/** Trous DÉLIBÉRÉS ou en attente, chacun avec sa raison. */
const TROUS_ADMIS: Record<number, string> = {
  56: "0056_purge_sent_notices.sql — sur la branche de la PR #90, non fusionnée. NON appliquée en base.",
};

function numerosPresents(): number[] {
  return readdirSync(DIR)
    .filter((f) => /^\d{4}_.*\.sql$/.test(f))
    .map((f) => Number(f.slice(0, 4)))
    .sort((a, b) => a - b);
}

test("les migrations forment une suite contiguë depuis 0001", () => {
  const presents = numerosPresents();
  assert.ok(presents.length > 0, `aucune migration trouvée dans ${DIR}`);
  assert.equal(presents[0], 1, "la suite doit commencer à 0001");

  const vus = new Set(presents);
  const manquants: number[] = [];
  for (let n = 1; n <= presents[presents.length - 1]; n++) {
    if (!vus.has(n)) manquants.push(n);
  }

  const inattendus = manquants.filter((n) => !(n in TROUS_ADMIS));
  assert.deepEqual(
    inattendus,
    [],
    `Numéro(s) de migration absent(s) du dépôt : ${inattendus
      .map((n) => String(n).padStart(4, "0"))
      .join(", ")}. Soit le fichier n'a jamais été fusionné (il vit sur une ` +
      `branche de PR — c'est le cas qui a produit ce test), soit le numéro a ` +
      `été sauté volontairement. Dans le second cas, l'inscrire dans ` +
      `TROUS_ADMIS avec sa raison.`
  );
});

test("aucune exemption périmée : un numéro exempté qui a gagné son fichier échoue", () => {
  const presents = new Set(numerosPresents());
  const perimees = Object.keys(TROUS_ADMIS)
    .map(Number)
    .filter((n) => presents.has(n));

  assert.deepEqual(
    perimees,
    [],
    `Exemption(s) périmée(s) : ${perimees
      .map((n) => String(n).padStart(4, "0"))
      .join(", ")} — le fichier est arrivé dans le dépôt, l'exemption doit ` +
      `partir. Une liste d'exemptions qui ne sait que grandir est une ` +
      `conformité par usure.`
  );
});
