import { getPublishedProducts, isSupabaseConfigured } from "@/lib/products";
import { getPhysicalView } from "@/lib/products-physical";
import { compteProximite, isTrackedStockKind } from "@/lib/product-kind";
import { rankShoppingCandidates, shoppingTerms, type ShoppingCandidate, type ShoppingIntent } from "@/lib/shopping-ai";
import { proximiteDesVendeurs } from "@/lib/proximite-serveur";

/**
 * Existing public catalogue and stock readers, under session RLS. No fixtures.
 *
 * `zoneAcheteurId` : la zone RECONNUE de l'acheteur (jamais le texte brut). Si
 * elle est fournie, les offres physiques sont classées par proximité du vendeur.
 * Si la lecture des zones échoue, le classement reste celui d'avant — dégradation
 * honnête, la proximité est une préférence et non une sécurité.
 */
export async function getShoppingRecommendations(intent: ShoppingIntent, sellerId?: string, zoneAcheteurId?: string | null) {
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
  const vendeurs = [...new Set(candidates.filter(c => compteProximite(c.kind)).map(c => c.sellerId).filter(Boolean))];
  const proximite = zoneAcheteurId && vendeurs.length ? await proximiteDesVendeurs(zoneAcheteurId, vendeurs) : null;
  return rankShoppingCandidates(candidates, intent, sellerId, proximite ?? undefined);
}
