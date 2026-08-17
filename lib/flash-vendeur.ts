import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingTable } from "@/lib/product-media";

/**
 * Les offres flash VIVANTES d'un vendeur, indexées par produit — pour le
 * tableau « Mes produits ». Map vide sans 0080 ou sur toute panne de
 * lecture : le décor ne casse jamais la page.
 */
export async function lireOffresVivantes(
  client: SupabaseClient,
  sellerId: string
): Promise<Map<string, { fin: string; prixFlashHtg: number }>> {
  const vides = new Map<string, { fin: string; prixFlashHtg: number }>();
  try {
    const { data, error } = await client
      .from("zabelie_flash_sales")
      .select("product_id, prix_flash_htg, fin, products!inner(seller_id)")
      .eq("products.seller_id", sellerId)
      .is("annulee_a", null)
      .gt("fin", new Date().toISOString());
    if (error || !data) {
      if (error && !isMissingTable(error)) {
        console.log(
          "[flash]",
          JSON.stringify({
            at: new Date().toISOString(),
            issue: "offres_vendeur_illisibles",
            message: error.message,
          })
        );
      }
      return vides;
    }
    for (const r of data as unknown as {
      product_id: string;
      prix_flash_htg: number;
      fin: string;
    }[]) {
      vides.set(r.product_id, {
        fin: r.fin,
        prixFlashHtg: Number(r.prix_flash_htg),
      });
    }
    return vides;
  } catch {
    return vides;
  }
}
