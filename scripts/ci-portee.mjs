#!/usr/bin/env node
/**
 * PORTÉE D'UN CHANGEMENT — l'e2e peut-il apprendre quelque chose de ce SHA ?
 *
 * POURQUOI
 * --------
 * Le job `e2e` coûte ~8 min sur les ~13 d'un run CI. Mesuré sur 30 jours
 * (2026-09-11 → 2026-10-11) : 64 runs sur 355 ne touchaient que de la
 * documentation. L'application ne lit AUCUN `.md` ni rien sous `docs/` à
 * l'exécution (vérifié : aucun import ni lecture dans app/, lib/,
 * components/, middleware, next.config) — un tel changement ne peut donc ni
 * casser ni réparer un parcours navigateur.
 *
 * CE QUI N'EST PAS SAUTÉ : `build`, `sql-tests`, et les tests unitaires. Une
 * vingtaine de tests LISENT `docs/` et des `.md` (CLAUDE.md, skills) : une
 * modification de documentation peut les faire rougir, ils tournent toujours.
 *
 * LA BASE DE COMPARAISON EST LA BRANCHE ENTIÈRE, PAS LE DERNIER COMMIT
 * --------------------------------------------------------------------
 * Le check `e2e` du SHA de tête est celui que la protection de branche lit, et
 * il couvre TOUT ce que la branche apporte à main. Une branche qui a touché du
 * code puis pousse un commit de doc seul n'est PAS « doc seulement » : on
 * compare au point de départ de la branche (merge-base avec origin/main). Le
 * piège inverse — juger sur le dernier commit — sauterait l'e2e d'un code
 * jamais testé, et ce saut aurait l'air d'un vert.
 *
 * Si la branche n'a touché que de la doc, son code EST celui d'un commit de
 * main déjà passé par l'e2e : sauter ne retire aucune vérification.
 *
 * DANS LE DOUTE, ON TESTE
 * -----------------------
 * Base introuvable (premier push d'un historique réécrit, `before` à zéro),
 * erreur Git, liste vide : `docsSeulement` vaut false et l'e2e tourne. Le saut
 * est l'exception prouvée, jamais le défaut.
 */

import { appendFileSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

/** Fichiers sans effet possible sur un parcours navigateur. */
const SANS_EFFET_E2E = /^docs\/|\.md$/;

/** Vrai seulement si la liste est NON VIDE et que tout y est documentation. */
export function sansEffetE2E(fichiers) {
  return fichiers.length > 0 && fichiers.every((f) => SANS_EFFET_E2E.test(f));
}

/**
 * Le commit à partir duquel on mesure ce que le SHA de tête apporte.
 * `null` = inconnu → l'appelant lance l'e2e.
 */
export function baseDeComparaison({ evenement, branche, payload, git }) {
  if (evenement === "pull_request") {
    const { base, head } = payload.pull_request ?? {};
    if (!base?.sha || !head?.sha) return null;
    return git(["merge-base", base.sha, head.sha]);
  }
  if (evenement !== "push") return null;
  if (branche === "main") {
    const avant = payload.before;
    return !avant || /^0+$/.test(avant) ? null : avant;
  }
  return git(["merge-base", "origin/main", "HEAD"]);
}

/** Décision complète, sans jamais lever : une erreur vaut « on teste ». */
export function porteeDuChangement({ evenement, branche, payload, git }) {
  try {
    const base = baseDeComparaison({ evenement, branche, payload, git });
    if (!base) return { docsSeulement: false, fichiers: [], raison: "base de comparaison inconnue : e2e lancé par prudence" };
    const tete = evenement === "pull_request" ? payload.pull_request.head.sha : "HEAD";
    const fichiers = git(["diff", "--name-only", base, tete]).split("\n").filter(Boolean);
    const docsSeulement = sansEffetE2E(fichiers);
    return {
      docsSeulement,
      fichiers,
      raison: docsSeulement
        ? `${fichiers.length} fichier(s), tous de documentation : le code est celui d'un commit de main déjà passé par l'e2e`
        : fichiers.length === 0 ? "aucun fichier modifié détecté : e2e lancé par prudence" : "le changement touche du code : e2e lancé",
    };
  } catch (erreur) {
    return { docsSeulement: false, fichiers: [], raison: `erreur pendant la mesure (${erreur instanceof Error ? erreur.message : erreur}) : e2e lancé par prudence` };
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const git = (args) => execFileSync("git", args, { encoding: "utf8" }).trim();
  let payload = {};
  try {
    payload = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH ?? "", "utf8"));
  } catch {
    // payload absent : baseDeComparaison rendra null pour un push sur main, et l'e2e tournera
  }
  const resultat = porteeDuChangement({
    evenement: process.env.GITHUB_EVENT_NAME,
    branche: process.env.GITHUB_REF_NAME,
    payload,
    git,
  });
  console.log(`docs_seulement=${resultat.docsSeulement} — ${resultat.raison}`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `docs_seulement=${resultat.docsSeulement}\n`);
  if (resultat.docsSeulement) {
    // Un saut doit se VOIR : annotation sur le run et résumé du job, avec la liste.
    console.log(`::notice title=e2e non exécuté::${resultat.raison}`);
    if (process.env.GITHUB_STEP_SUMMARY) {
      appendFileSync(
        process.env.GITHUB_STEP_SUMMARY,
        `### e2e non exécuté — changement de documentation seule\n\n${resultat.raison}.\n\n` +
          resultat.fichiers.map((f) => `- \`${f}\``).join("\n") + "\n"
      );
    }
  }
}
