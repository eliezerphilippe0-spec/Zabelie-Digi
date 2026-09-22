import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/products";
import { mergeOffers, OFFER_UUID, type PublicOffer, type ProductOffer } from "@/lib/product-offers";
export async function publicOffers(productId: string, buyerId?: string): Promise<PublicOffer[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    const admin = createAdminClient();
    const params = { p_product_id: productId, p_buyer_id: buyerId ?? null };
    const [manual, automatic] = await Promise.all([
      admin.rpc("zabelie_offers_public", params), admin.rpc("zabelie_product_recommendations", params),
    ]);
    if (manual.error) console.error("[product-offers] public read unavailable", manual.error.code);
    if (automatic.error) console.error("[product-offers] recommendations unavailable", automatic.error.code);
    return mergeOffers((manual.data ?? []) as PublicOffer[], (automatic.data ?? []) as PublicOffer[]);
  } catch { console.error("[product-offers] public read unavailable"); return []; }
}
export async function sellerOffers(client: SupabaseClient, sellerId: string) {
  const [offers, stats, recommendations] = await Promise.all([
    client.from("zabelie_product_offers").select("id,source_product_id,target_product_id,offer_kind,active").eq("active", true),
    createAdminClient().rpc("zabelie_offer_stats", { p_user_id: sellerId }),
    createAdminClient().rpc("zabelie_recommendation_stats", { p_user_id: sellerId }),
  ]);
  if (offers.error || stats.error) return null;
  return { offers: (offers.data ?? []) as ProductOffer[],
    recommendations: recommendations.error ? null : new Map<string, number>((recommendations.data ?? []).map((row: { product_id: string; confirmed: number }) => [row.product_id, Number(row.confirmed)])),
    stats: new Map<string, number>((stats.data ?? []).map((row: { offer_id: string; confirmed: number }) => [row.offer_id, Number(row.confirmed)])) };
}
/** Une attribution ne fixe jamais le montant ; le trigger ignore tout lien périmé/falsifié. */
export function offerAttribution(input: unknown): { zabelie_offer_id?: string } {
  return typeof input === "string" && OFFER_UUID.test(input) ? { zabelie_offer_id: input } : {};
}
