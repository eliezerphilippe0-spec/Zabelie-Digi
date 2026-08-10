import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Journal d'audit des actes d'administration — `zabelie_admin_actions` (0055).
 *
 * BEST-EFFORT ASSUMÉ, et voici pourquoi : les mutations admin passent par des
 * RPC (refund_order, zabelie_settle_payout…) dont la transaction est close
 * quand la route reprend la main — écrire la trace dans la même transaction
 * exigerait de modifier chaque fonction d'argent, ce que l'interdit n°5 du
 * chantier (ne pas toucher un mécanisme qui fonctionne) écarte. La trace est
 * donc écrite APRÈS l'acte, et un échec d'écriture ne fait pas échouer un
 * acte déjà commis — il serait absurde de rendre 500 pour un remboursement
 * qui a EU LIEU.
 *
 * En contrepartie, l'échec ne doit jamais être muet (l'absence de signal doit
 * être un signal) : chaque écriture ratée sort une ligne [admin/audit] en
 * journal serveur, avec l'action et le motif — jamais les données.
 *
 * Tant que 0055 n'est pas appliquée en base, chaque appel journalise
 * `echec_ecriture` (table absente) : c'est la dégradation prévue, comme le
 * repli in_stock de lib/products — elle cesse à l'application, sans déploiement.
 *
 * `action` suit la forme `domaine.verbe` — contrainte SQL 0055, contrat
 * stable (« order.refund », « payout.settle », « user.suspend »).
 */
export type ActeAdmin = {
  actorId: string;
  action: string;
  targetType?: string;
  targetId?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
};

export async function journaliserActeAdmin(
  admin: SupabaseClient,
  acte: ActeAdmin
): Promise<void> {
  try {
    const { error } = await admin.from("zabelie_admin_actions").insert({
      actor_id: acte.actorId,
      action: acte.action,
      target_type: acte.targetType ?? null,
      target_id: acte.targetId ?? null,
      reason: acte.reason ?? null,
      metadata: acte.metadata ?? null,
    });
    if (error) {
      console.log(
        "[admin/audit]",
        JSON.stringify({
          at: new Date().toISOString(),
          issue: "echec_ecriture",
          action: acte.action,
          message: error.message,
        })
      );
    }
  } catch (e) {
    console.log(
      "[admin/audit]",
      JSON.stringify({
        at: new Date().toISOString(),
        issue: "echec_ecriture",
        action: acte.action,
        message: e instanceof Error ? e.message : String(e),
      })
    );
  }
}
