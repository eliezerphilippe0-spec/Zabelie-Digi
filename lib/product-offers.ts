import type { ProductKind } from "@/lib/product-kind";
export const OFFER_KINDS = ["upsell", "cross_sell", "downsell"] as const;
export type OfferKind = typeof OFFER_KINDS[number];
export type OfferSelection = Record<OfferKind, string | null>;
export const EMPTY_OFFERS: OfferSelection = { upsell: null, cross_sell: null, downsell: null };
export const OFFER_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export type OfferProduct = { id: string; kind: ProductKind; price_htg: number; status: string };
export type ProductOffer = { id: string; source_product_id: string; target_product_id: string; offer_kind: OfferKind; active: boolean };
export type PublicOffer = { id: string; offer_kind: OfferKind; target_product_id: string; title: string; slug: string; price_htg: number; product_kind: ProductKind };
export function parseOfferSelection(value: unknown): OfferSelection | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some(key => !OFFER_KINDS.includes(key as OfferKind))) return null;
  const result = { ...EMPTY_OFFERS };
  for (const kind of OFFER_KINDS) {
    const target = input[kind] ?? null;
    if (target !== null && (typeof target !== "string" || !OFFER_UUID.test(target))) return null;
    result[kind] = typeof target === "string" ? target.toLowerCase() : null;
  }
  const targets = Object.values(result).filter(Boolean);
  return new Set(targets).size === targets.length ? result : null;
}
/** Appelé côté serveur pour préparer les choix ; la base refait ces contrôles. */
export function eligibleOffer(source: OfferProduct, target: OfferProduct, kind: OfferKind): boolean {
  if (source.id === target.id || source.status !== "published" || target.status !== "published") return false;
  if (kind === "cross_sell") return true;
  return source.kind === target.kind && (kind === "upsell" ? target.price_htg > source.price_htg : target.price_htg < source.price_htg);
}
export function offerHref(offer: Pick<PublicOffer, "slug" | "id">): string {
  return "/produit/" + encodeURIComponent(offer.slug) + "?offre=" + encodeURIComponent(offer.id);
}
