import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingTable } from "@/lib/product-media";

export type OffreFlash = {
  id: string;
  prixFlashHtg: number;
  debut: string;
  fin: string;
  unitesMax: number | null;
};

/**
 * L'offre flash VIVANTE d'un produit — fenêtre relue à chaque appel, jamais
 * mise en cache : le checkout doit voir l'expiration à la seconde, pas à la
 * revalidation. Dormant-behind-schema : sans 0080, `null` — la fiche affiche
 * le prix normal et le checkout facture le prix normal, exactement comme
 * avant la migration.
 */
export async function offreFlashActive(
  admin: SupabaseClient,
  productId: string
): Promise<OffreFlash | null> {
  try {
    const { data, error } = await admin
      .from("zabelie_flash_sales")
      .select("id, prix_flash_htg, debut, fin, unites_max")
      .eq("product_id", productId)
      .is("annulee_a", null)
      .lte("debut", new Date().toISOString())
      .gt("fin", new Date().toISOString())
      .order("fin", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error || !data) {
      if (error && !isMissingTable(error)) {
        console.log(
          "[flash]",
          JSON.stringify({
            at: new Date().toISOString(),
            issue: "lecture_echouee",
            productId,
            message: error.message,
          })
        );
      }
      return null;
    }
    return {
      id: data.id,
      prixFlashHtg: Number(data.prix_flash_htg),
      debut: data.debut,
      fin: data.fin,
      unitesMax: data.unites_max === null ? null : Number(data.unites_max),
    };
  } catch {
    // Une panne de lecture ne casse jamais une vente : prix normal.
    return null;
  }
}

/**
 * Le plafond d'unités est-il atteint ? Compte les commandes NON ANNULÉES de
 * la fenêtre. Fail-open assumé : si le comptage échoue, on vend au prix flash
 * plutôt que de bloquer un acheteur — l'erreur coûte au vendeur quelques
 * unités remisées de plus, jamais une vente au mauvais prix.
 */
export async function flashEpuisee(
  admin: SupabaseClient,
  productId: string,
  offre: OffreFlash
): Promise<boolean> {
  if (offre.unitesMax === null) return false;
  const { count, error } = await admin
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("product_id", productId)
    .neq("status", "cancelled")
    .gte("created_at", offre.debut);
  if (error) return false;
  return (count ?? 0) >= offre.unitesMax;
}
