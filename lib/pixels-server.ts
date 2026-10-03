import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/products";
import { idsPixels, type IdsPixels } from "@/lib/pixels";

/**
 * Pixels d'un vendeur, lus par le service pour une page publique. Une panne
 * de lecture rend `null` (aucun pixel) et le journalise : une page produit ne
 * tombe jamais à cause d'un traceur publicitaire.
 */
export async function lirePixelsVendeur(sellerId: string | null | undefined): Promise<IdsPixels | null> {
  if (!sellerId || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await createAdminClient()
      .from("zabelie_seller_pixels")
      .select("meta_pixel_id, google_tag_id, tiktok_pixel_id")
      .eq("seller_id", sellerId)
      .maybeSingle();
    if (error) { console.warn("[pixels] lecture impossible", error.message); return null; }
    return idsPixels(data);
  } catch (e) {
    console.warn("[pixels] lecture impossible", e instanceof Error ? e.message : e);
    return null;
  }
}
