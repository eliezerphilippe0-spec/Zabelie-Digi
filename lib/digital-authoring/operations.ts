/**
 * Studio de création éditoriale — contrat des opérations (docs/70 §6, PRD §10).
 *
 * Module PUR : la base reste l'autorité (tâche 3.1 : unicité, quotas, bail) ;
 * ces fonctions disent ce qui est admis, pour que la route, l'exécuteur et
 * l'écran tiennent la MÊME règle.
 *
 * La règle qui commande tout le fichier : **une issue incertaine ne déclenche
 * jamais un second appel automatique.** Ni OpenAI ni Gemini n'offrent de clé
 * d'idempotence ni de consultation d'état sur ces appels : un délai dépassé
 * APRÈS l'envoi ne se rapproche pas, il reste `uncertain`, et son quota reste
 * consommé. Relancer est un geste du vendeur, avec une nouvelle clé.
 */

export const TYPES_OPERATION = ["plan", "draft", "rewrite", "exercise"] as const;
export type TypeOperation = (typeof TYPES_OPERATION)[number];

export const ETATS_OPERATION = ["queued", "running", "succeeded", "failed", "uncertain", "cancelled"] as const;
export type EtatOperation = (typeof ETATS_OPERATION)[number];

const FINAUX: ReadonlySet<EtatOperation> = new Set(["succeeded", "failed", "uncertain", "cancelled"]);

export function estFinal(etat: EtatOperation): boolean {
  return FINAUX.has(etat);
}

/**
 * `soumis` : l'exécuteur a ÉCRIT qu'il envoyait (avant l'appel réseau, jamais
 * après). C'est lui qui sépare ce qui peut encore être annulé de ce qui a pu
 * être accepté par le fournisseur.
 */
export function transitionAdmise(de: EtatOperation, vers: EtatOperation, soumis: boolean): boolean {
  switch (de) {
    case "queued":
      // Rien n'est parti : ni succès, ni incertitude possibles.
      return !soumis && (vers === "running" || vers === "cancelled" || vers === "failed");
    case "running":
      if (vers === "succeeded" || vers === "uncertain") return soumis;
      // Annuler après l'envoi mentirait : le fournisseur a pu accepter (PRD §10.3).
      if (vers === "cancelled") return !soumis;
      return vers === "failed";
    default:
      return false; // état final : on ne repart pas.
  }
}

/**
 * Un exécuteur peut-il (re)prendre l'opération ? Oui si elle attend, ou si un
 * bail a expiré AVANT tout envoi. Un bail expiré après l'envoi ne rend PAS la
 * main : il fait passer l'opération en `uncertain` (PRD §10.4).
 */
export function repriseAdmise(o: { etat: EtatOperation; soumis: boolean; bailExpire: boolean }): boolean {
  if (o.etat === "queued") return true;
  return o.etat === "running" && !o.soumis && o.bailExpire;
}

export function doitDevenirIncertaine(o: { etat: EtatOperation; soumis: boolean; bailExpire: boolean }): boolean {
  return o.etat === "running" && o.soumis && o.bailExpire;
}

/** Le quota réservé ne se rend que si RIEN n'a pu partir (PRD §11.1). */
export function reservationLiberable(o: { etat: EtatOperation; soumis: boolean }): boolean {
  return (o.etat === "cancelled" || o.etat === "failed") && !o.soumis;
}

/** Codes d'erreur bornés : stockés en base, traduits à l'écran, jamais un message libre. */
export const CODES_ERREUR = [
  "sortie_invalide",
  "fournisseur_refus",
  "delai_depasse",
  "ia_coupee",
  "compte_inactif",
  "configuration_absente",
  "budget_epuise",
  "projet_inadmissible",
] as const;
export type CodeErreur = (typeof CODES_ERREUR)[number];

/**
 * Ce qu'on sait après un envoi. `aucune_reponse` couvre le délai dépassé et la
 * coupure réseau : le fournisseur a pu traiter la demande, on ne le saura pas.
 */
export type IssueEnvoi =
  | { type: "aucune_reponse" }
  | { type: "reponse"; statut: number; sortieValide: boolean };

export function classerIssue(issue: IssueEnvoi): { etat: EtatOperation; code: CodeErreur | null } {
  if (issue.type === "aucune_reponse") return { etat: "uncertain", code: "delai_depasse" };
  const { statut, sortieValide } = issue;
  if (statut >= 200 && statut < 300) {
    return sortieValide ? { etat: "succeeded", code: null } : { etat: "failed", code: "sortie_invalide" };
  }
  // 408 et 5xx : la passerelle a répondu, le modèle a peut-être tourné.
  if (statut === 408 || statut >= 500) return { etat: "uncertain", code: "delai_depasse" };
  return { etat: "failed", code: "fournisseur_refus" };
}

/**
 * Rejeu d'une clé d'idempotence (unique par vendeur, PRD STU 09) : même
 * empreinte d'entrée → même opération, rien de relancé ; autre empreinte →
 * conflit, sans appel. Une clé ne désigne jamais deux demandes.
 */
export function rejeu(existante: { empreinte: string }, empreinteDemande: string): "meme_operation" | "conflit" {
  return existante.empreinte === empreinteDemande ? "meme_operation" : "conflit";
}
