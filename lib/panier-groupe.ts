import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * PAIEMENT GROUPÉ (0128) — les AUTRES commandes d'un groupe confirmé, à
 * partir de sa meneuse.
 *
 * Les six sites de confirmation (retour MonCash, webhooks Kobara et Stripe,
 * trois réconciliateurs) ne connaissent que la commande dont l'opérateur
 * renvoie la clé : la meneuse. L'argent des autres est déjà confirmé EN BASE
 * par `zabelie_confirm_group_payment` ; ce qui leur manquerait, c'est ce qui
 * se fait APRÈS — ouvrir le suivi de remise, prévenir acheteur et vendeur.
 * `ouvrirSuiviLivraison` et `notifyOrderPaid` l'appellent, ce qui étend les
 * six sites d'un coup sans en toucher un.
 *
 * Vide pour une commande hors groupe, une commande non meneuse, un groupe non
 * confirmé — et en cas d'erreur, y compris tant que `0128` n'est pas
 * appliquée (la colonne `group_id` n'existe pas) : jamais d'exception vers le
 * flux de paiement.
 */
export async function autresCommandesDuGroupe(admin: SupabaseClient, orderId: string): Promise<string[]> {
  try {
    const { data: commande, error } = await admin.from("orders").select("group_id").eq("id", orderId).maybeSingle();
    if (error || !commande?.group_id) return [];
    const { data: groupe } = await admin
      .from("zabelie_order_groups")
      .select("leader_order_id, status")
      .eq("id", commande.group_id)
      .maybeSingle();
    if (!groupe || groupe.leader_order_id !== orderId || groupe.status !== "confirmed") return [];
    const { data: autres } = await admin.from("orders").select("id").eq("group_id", commande.group_id).neq("id", orderId);
    return ((autres ?? []) as { id: string }[]).map((r) => r.id);
  } catch {
    return [];
  }
}
