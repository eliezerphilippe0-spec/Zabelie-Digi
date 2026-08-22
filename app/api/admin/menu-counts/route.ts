import { NextResponse } from "next/server";
import { erreurTraduite } from "@/lib/api-erreur";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Compteurs des files admin — un appel, quatre `count head:true`.
 *
 * [DÉCISION AGENT — à valider] Le prompt du lot proposait une RPC SQL
 * (`zabelie_admin_menu_counts`) « si une migration est nécessaire ». Elle ne
 * l'est pas : une route API avec la garde rôle des routes admin existantes
 * fait le même travail, sans migration à faire appliquer par le porteur —
 * le lot fonctionne dès la fusion. La sécurité est identique : rôle vérifié
 * côté serveur (`getCurrentUser`), service role jamais exposé, un non-admin
 * reçoit une erreur, jamais des données.
 *
 * [DÉCISION AGENT — à valider] Les quatre compteurs demandés étaient
 * « commandes / vendeurs KYC / litiges / produits ». Deux n'ont AUCUNE source
 * de données : le KYC (chantier 2, spec en PR #66, rien d'implémenté) et la
 * table de litiges (docs/28 M3, spec seulement). Inventer ces compteurs
 * afficherait des zéros structurels déguisés en « rien à faire » — la règle
 * absolue interdit les statistiques inventées. Les badges portent donc les
 * files RÉELLES du back-office d'aujourd'hui, celles que la page /admin
 * traite déjà :
 *   - produits   : fiches en brouillon (attendent la publication humaine) ;
 *   - zelle      : paiements Zelle en attente de confirmation manuelle ;
 *   - rechaj     : recharges en action requise (zelle à confirmer + remboursements) ;
 *   - litiges    : commandes `disputed` — le marqueur de litige réel actuel
 *                  (garde-fou de montant + 0043 quand elle sera appliquée).
 * KYC rejoindra ce JSON quand le chantier 2 sera implémenté.
 *
 * Sortie stricte : `{ produits, zelle, rechaj, litiges }` (entiers ≥ 0) ou
 * `{ error }`. Un échec de comptage rend 0 — un badge absent vaut mieux
 * qu'une page admin cassée par son propre décor.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return erreurTraduite("api.access.denied", 403);
  }

  const admin = createAdminClient();
  const compte = async (q: PromiseLike<{ count: number | null; error: unknown }>) => {
    try {
      const { count, error } = await q;
      return error ? 0 : (count ?? 0);
    } catch {
      return 0;
    }
  };

  const [produits, zelle, rechaj, litiges] = await Promise.all([
    compte(
      admin.from("products").select("*", { count: "exact", head: true }).eq("status", "draft")
    ),
    compte(
      admin
        .from("payments")
        .select("*", { count: "exact", head: true })
        .eq("rail", "zelle")
        .eq("status", "pending")
    ),
    compte(
      admin
        .from("zabelie_topup_orders")
        .select("*", { count: "exact", head: true })
        .or("and(rail.eq.zelle,status.eq.payment_pending),status.eq.refund_pending")
    ),
    compte(
      admin.from("orders").select("*", { count: "exact", head: true }).eq("status", "disputed")
    ),
  ]);

  return NextResponse.json({ produits, zelle, rechaj, litiges });
}
