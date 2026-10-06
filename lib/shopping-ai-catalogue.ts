import { getPublishedProducts, isSupabaseConfigured } from "@/lib/products";
import { getPhysicalView } from "@/lib/products-physical";
import { isTrackedStockKind } from "@/lib/product-kind";
import { rankShoppingCandidates, shoppingTerms, type ShoppingCandidate, type ShoppingIntent } from "@/lib/shopping-ai";

/** Existing public catalogue and stock readers, under session RLS. No fixtures. */
export async function getShoppingRecommendations(intent: ShoppingIntent, sellerId?: string) {
  if (!isSupabaseConfigured()) throw new Error("shopping_catalogue_unavailable");
  const products = await getPublishedProducts({ searchTerms: [...new Set([...intent.query.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(t => t.length > 2), ...shoppingTerms(intent.query)])].slice(0, 8), sellerId, kind: intent.kind ?? undefined });
  // Bound stock reads. This is a shortlist, never a claim to compare all offers.
  const shortlist = products.slice(0, 24);
  const candidates = await Promise.all(shortlist.map(async (p): Promise<ShoppingCandidate> => {
    const physical = isTrackedStockKind(p.kind) ? await getPhysicalView(p.id) : null;
    const availableVariants = physical?.variants.filter(v => v.available > 0) ?? [];
    return {
      id: p.id, slug: p.slug, title: p.title, description: p.blurb,
      sellerId: p.creatorId ?? "", kind: p.kind,
      priceHtg: isTrackedStockKind(p.kind)
        ? (availableVariants.length ? Math.min(...availableVariants.map(v => v.priceHTG)) : p.priceHTG)
        : p.priceHTG,
      available: isTrackedStockKind(p.kind) ? availableVariants.length > 0 : true,
      ratingAverage: p.ratingAvg, ratingCount: p.ratingCount,
    };
  }));
  return rankShoppingCandidates(candidates, intent, sellerId);
}
