/**
 * Studio de création éditoriale — sauvegarde par comparaison de révision
 * (docs/70 §7.1, PRD §10.1, STU 05).
 *
 * La base exécute `update … where id = $1 and revision = $attendue` et un
 * trigger impose `revision = old.revision + 1` (tâche 2.1). Ces fonctions
 * PURES interprètent ce qu'elle rend, pour que la route et l'écran disent la
 * même chose : « enregistré » n'apparaît qu'après une ligne réellement écrite.
 */

/** Une révision est un entier ≥ 1 : la création écrit 1. */
export function revisionValide(n: unknown): n is number {
  return typeof n === "number" && Number.isSafeInteger(n) && n >= 1;
}

export type IssueSauvegarde =
  | { etat: "enregistre"; revision: number }
  | { etat: "conflit"; revisionServeur: number };

/**
 * `lignesModifiees` vient de la base. 1 : notre révision était la bonne.
 * 0 : quelqu'un (un autre onglet) a écrit avant nous — conflit explicite,
 * jamais une écriture gagnante silencieuse.
 */
export function issueSauvegarde(attendue: number, lignesModifiees: number, revisionServeur: number): IssueSauvegarde {
  if (lignesModifiees === 1) return { etat: "enregistre", revision: attendue + 1 };
  if (lignesModifiees === 0) return { etat: "conflit", revisionServeur };
  // Une clé primaire ne peut pas modifier deux lignes : si ça arrive, rien
  // d'autre dans ce fichier n'est plus vrai — on refuse de conclure.
  throw new Error(`sauvegarde : ${lignesModifiees} lignes modifiées pour une clé primaire`);
}

export type Rapprochement = "deja_enregistre" | "non_enregistre" | "conflit";

/**
 * La réponse s'est perdue (réseau coupé après l'envoi). Le navigateur ne
 * suppose RIEN : il relit la révision et l'empreinte du serveur (PRD §10.1).
 *   - le serveur porte la révision suivante ET notre empreinte : c'était nous ;
 *   - le serveur porte encore la révision attendue : rien n'est écrit, on
 *     peut renvoyer la même demande ;
 *   - tout autre cas : quelqu'un d'autre a écrit, c'est un conflit.
 */
export function rapprocherApresPerte(
  envoi: { revisionAttendue: number; empreinte: string },
  serveur: { revision: number; empreinte: string }
): Rapprochement {
  if (serveur.revision === envoi.revisionAttendue + 1 && serveur.empreinte === envoi.empreinte) return "deja_enregistre";
  if (serveur.revision === envoi.revisionAttendue) return "non_enregistre";
  return "conflit";
}

/**
 * Une proposition d'IA porte la révision sur laquelle elle a été calculée.
 * Elle ne remplace JAMAIS le texte d'elle-même (STU 04) ; l'écran dit
 * seulement si le texte a bougé depuis.
 */
export function etatProposition(revisionSource: number, revisionCourante: number): "a_jour" | "texte_modifie_depuis" {
  return revisionSource === revisionCourante ? "a_jour" : "texte_modifie_depuis";
}
