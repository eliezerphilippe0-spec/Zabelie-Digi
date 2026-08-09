/**
 * Ouverture du SUIVI DE REMISE, appelée juste après `confirm_payment` aux
 * quatre points de confirmation (retour MonCash, réconciliateur, webhook
 * Stripe, confirmation admin Zelle).
 *
 * POURQUOI CE MODULE EXISTE PLUTÔT QUE QUATRE APPELS DIRECTS
 * ---------------------------------------------------------
 * `0043` le dit dans le corps du filet §6 bis : « quatre sites d'appel, c'est
 * quatre occasions d'oublier, et un cinquième rail ajouté plus tard
 * n'hériterait de rien ». Un module unique ne supprime pas l'oubli — les
 * quatre appels restent quatre — mais il donne au croisement de
 * `tests/fulfillment-appelants.test.ts` UN NOM à chercher dans chaque fichier
 * qui confirme un paiement. Sans nom commun, il n'y a rien à croiser.
 *
 * CE QUE FAIT L'APPEL EN BASE. `zabelie_open_fulfillment` sort tout de suite
 * si le produit n'est pas physique : le flux digital est inchangé au bit près.
 * Pour un physique, elle crée la ligne de suivi et pose `gated_on_delivery` sur
 * l'escrow — l'argent cesse de mûrir au chronomètre.
 *
 * ORDRE OBLIGATOIRE : APRÈS `confirm_payment`, jamais avant. C'est
 * `confirm_payment` qui crée l'entrée d'escrow ; appelée avant, la fonction
 * créerait bien la ligne de suivi mais son `update … where status = 'maturing'`
 * ne toucherait AUCUNE ligne. L'argent resterait libre de mûrir alors que tout
 * aurait l'air en place. C'est précisément le cas que le filet §6 bis teste par
 * l'ÉTAT (« l'escrow est-il gelé ? ») et non par l'indice (« une ligne de suivi
 * existe-t-elle ? »).
 *
 * POURQUOI L'ERREUR NE REMONTE JAMAIS AU FLUX DE PAIEMENT. Le paiement est
 * acquis : l'acheteur a payé, `confirm_payment` a rendu la main. Faire échouer
 * la route ici ne dégèlerait rien et ferait rejouer un webhook pour une raison
 * étrangère au paiement. Le rattrapage existe et il est structurel : le filet
 * du balayage quotidien (`orphan_grace_hours`, 6 h) reprend toute commande
 * physique payée dont l'escrow n'est pas gelé. Latence au pire ~30 h, à
 * comparer aux 7 jours avant maturation — la réparation atterrit toujours
 * largement avant que l'argent bouge.
 *
 * Ce n'est donc PAS « best-effort » au sens de « tant pis » : c'est un premier
 * essai dont l'échec est rattrapé par un mécanisme distinct, et journalisé pour
 * qu'un échec systématique se voie sans attendre le filet.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/** Ce que l'appel a produit — la valeur sert au journal, pas au flux. */
export type IssueSuivi = "ouvert" | "non_physique" | "echec";

/**
 * Ce que rendent les trois RPC de déclaration (§4 et §4 bis de `0043`).
 * `ok: true` avec `duplicate: true` est un SUCCÈS : le rejeu d'un clic sur une
 * connexion qui coupe est le cas normal ici, pas une erreur à afficher.
 */
export type ResultatDeclaration = {
  ok?: boolean;
  duplicate?: boolean;
  reason?: string;
  status?: string;
  auto?: boolean;
};

/**
 * Correspondance motif → code HTTP. Écrite UNE FOIS pour les trois routes :
 * trois tables recopiées divergeraient à la première valeur ajoutée à la
 * machine à états, et c'est l'acheteur qui verrait un 500 pour un refus
 * parfaitement prévu.
 *
 * `suivi_absent` mérite son 409 et non un 404 : la commande existe, c'est le
 * SUIVI qui n'a pas lieu d'être — produit digital, ou physique dont l'escrow
 * n'a pas encore été ouvert. Un 404 laisserait croire que la commande est
 * introuvable.
 */
const CODE_PAR_MOTIF: Record<string, number> = {
  commande_introuvable: 404,
  non_autorise: 403,
  suivi_absent: 409,
  etat_incompatible: 409,
  pas_encore_expedie: 409,
  deja_receptionne: 409,
};

/** 400 par défaut : un motif inconnu est une erreur du client, pas du serveur. */
export function codeHttpDuMotif(motif: string | undefined): number {
  if (!motif) return 400;
  return CODE_PAR_MOTIF[motif] ?? 400;
}

/**
 * Journal émis à CHAQUE appel, y compris quand il n'y a rien à ouvrir.
 *
 * Sans ligne systématique, « l'appel n'a pas eu lieu » (site oublié, import
 * cassé) et « il a eu lieu, le produit était digital » produisent le même
 * journal : rien. Même règle que les crons — l'absence de signal doit être un
 * signal. Le champ `site` nomme le rail : un rail qui cesse d'apparaître dans
 * le journal se voit, alors qu'un total agrégé le masquerait.
 */
function journal(champs: Record<string, unknown>) {
  console.log("[fulfillment/ouverture]", JSON.stringify({ at: new Date().toISOString(), ...champs }));
}

export async function ouvrirSuiviLivraison(
  admin: SupabaseClient,
  orderId: string,
  site: string
): Promise<IssueSuivi> {
  try {
    const { data, error } = await admin.rpc("zabelie_open_fulfillment", {
      p_order_id: orderId,
    });
    if (error) {
      // Aucun identifiant de commande dans le journal : `orderId` est une
      // référence d'achat, pas une donnée personnelle, mais le message du
      // moteur peut en contenir. On journalise le message tel quel — il vient
      // de Postgres, pas de l'utilisateur — et l'identifiant de commande, qui
      // est ce dont on a besoin pour retrouver le dossier.
      journal({ issue: "echec", site, commande: orderId, message: error.message });
      return "echec";
    }
    const ouvert = data === true;
    journal({ issue: ouvert ? "ouvert" : "non_physique", site, commande: orderId });
    return ouvert ? "ouvert" : "non_physique";
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur";
    journal({ issue: "echec", site, commande: orderId, message });
    return "echec";
  }
}
