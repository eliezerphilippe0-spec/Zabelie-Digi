/**
 * Vente de recharge EN PROPRE par Zabelie — fermée par décision du porteur.
 *
 * LA DÉCISION (Philippe, 2026-08-01)
 * -----------------------------------
 * Zabelie est une marketplace pure : un INTERMÉDIAIRE entre vendeurs vérifiés
 * et acheteurs. Elle ne détient aucun stock et ne vend rien en son nom propre.
 * La recharge téléphonique first-party (`/rechaj`, rail Reloadly) était la
 * SEULE activité où Zabelie était marchand plutôt qu'intermédiaire. Elle
 * contredit le modèle, donc elle ferme. → `docs/02-DECISIONS.md`.
 *
 * DRAPEAU PLUTÔT QUE SUPPRESSION — et ce n'est pas de la prudence
 * ---------------------------------------------------------------
 * `0010` et `0029` sont APPLIQUÉES en production. Des commandes de recharge
 * peuvent exister, payées. Supprimer le code laisserait ces acheteurs sans
 * suivi et sans remboursement — on fermerait une boutique en gardant l'argent.
 * Désactiver est réversible ; supprimer ne l'est pas.
 *
 * CE QUE LE DRAPEAU FERME, ET CE QU'IL NE FERME PAS
 * -------------------------------------------------
 * Il ferme la VENTE : la page d'achat et la création de commande.
 * Il laisse ouvert tout ce qui sert une commande DÉJÀ passée — consultation
 * de son état, confirmation admin d'un virement Zelle reçu, remboursement.
 * Un acheteur qui a payé hier doit pouvoir suivre et se faire rembourser
 * aujourd'hui, même si la vente est close.
 *
 * ⚠️ CE QUE CETTE DÉCISION NE ROUVRE PAS
 * ---------------------------------------
 * Elle ne dit RIEN sur la revente de solde MonCash / NatCash par des vendeurs.
 * Celle-ci reste interdite : un agent MonCash fait du cash-in/cash-out de
 * monnaie électronique — `docs/07-TOPUP.md` §3 et `docs/17`. « Zabelie ne vend
 * plus de minutes » n'est pas « des vendeurs peuvent en vendre ».
 *
 * POUR RENVERSER : poser `ZABELIE_TOPUP_FIRSTPARTY_ENABLED=true`. Rien
 * d'autre. C'est délibérément un seul geste, et il est réversible dans les
 * deux sens.
 */

/**
 * Défaut FERMÉ. L'absence de variable vaut fermeture — une fonctionnalité que
 * le porteur a close ne doit pas rouvrir parce qu'un environnement a oublié
 * une ligne. Seule la chaîne exacte `true` ouvre.
 */
export function isTopupFirstPartyEnabled(): boolean {
  return process.env.ZABELIE_TOPUP_FIRSTPARTY_ENABLED === "true";
}

/** Corps de réponse des routes de VENTE quand la vente est close. */
export const TOPUP_CLOSED_BODY = {
  error: "topup_firstparty_closed",
  message:
    "La vente de recharge par Zabelie est fermée. Zabelie est une place de " +
    "marché : les produits y sont vendus par des vendeurs vérifiés.",
} as const;

/** 410 Gone, pas 404 ni 503 : la ressource a existé et ne reviendra pas. */
export const TOPUP_CLOSED_STATUS = 410;
