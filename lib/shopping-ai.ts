import { z } from "zod";
import { PRODUCT_KINDS, type ProductKind } from "@/lib/product-kind";

// The model may extract intent; it never supplies prices, products or actions.
export const ShoppingIntentSchema = z.object({
  query: z.string().trim().max(160).default(""),
  need: z.string().trim().max(300).default(""),
  budgetHtg: z.number().int().min(0).max(2_147_483_647).nullable().default(null),
  location: z.string().trim().max(120).default(""),
  kind: z.enum(PRODUCT_KINDS).nullable().default(null),
}).strict();
export type ShoppingIntent = z.infer<typeof ShoppingIntentSchema>;
export const ShoppingRequestSchema = z.object({
  intent: ShoppingIntentSchema,
  message: z.string().trim().min(1).max(1000).optional(),
  sellerId: z.string().uuid().optional(),
  lang: z.enum(["fr", "ht", "en", "es"]),
}).strict();

export type ShoppingCandidate = {
  id: string; slug: string; title: string; description: string; sellerId: string;
  kind: ProductKind; priceHtg: number; ratingAverage: number | null;
  ratingCount: number; available: boolean;
};
export type ShoppingRecommendation = ShoppingCandidate & {
  position: number; priceDifferenceHtg: number; matchedTerms: string[];
};
export type ShoppingResult = {
  intent: ShoppingIntent;
  question: "query" | "budgetHtg" | "need" | "location" | null;
  recommendations: ShoppingRecommendation[];
};

export function nextShoppingQuestion(intent: ShoppingIntent): ShoppingResult["question"] {
  if (!intent.query) return "query";
  if (intent.budgetHtg === null) return "budgetHtg";
  if (!intent.need) return "need";
  if (!intent.location) return "location";
  return null;
}

export function shoppingTerms(text: string): string[] {
  return [...new Set(text.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(t => t.length > 2))].slice(0, 8);
}
const normalized = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** Relevance precedes reviews and price. No commission or sponsored weighting. */
export function rankShoppingCandidates(candidates: ShoppingCandidate[], intent: ShoppingIntent, sellerId?: string): ShoppingRecommendation[] {
  const terms = shoppingTerms(intent.query);
  const preferences = shoppingTerms(intent.need);
  if (!terms.length || intent.budgetHtg === null) return [];
  const seen = new Set<string>();
  const scored = candidates.flatMap(product => {
    if (seen.has(product.id) || !product.available || !Number.isSafeInteger(product.priceHtg) || product.priceHtg < 0
      || product.priceHtg > intent.budgetHtg! || (sellerId && product.sellerId !== sellerId)
      || (intent.kind && product.kind !== intent.kind)) return [];
    const title = normalized(product.title);
    const text = normalized(`${product.title} ${product.description}`);
    const matches = terms.filter(t => text.includes(t));
    if (!matches.length) return [];
    seen.add(product.id);
    const score = matches.length * 10 + terms.filter(t => title.includes(t)).length * 5
      + preferences.filter(t => text.includes(t)).length * 2;
    return [{ product, score }];
  }).sort((a, b) => b.score - a.score
    || (b.product.ratingAverage ?? 0) - (a.product.ratingAverage ?? 0)
    || a.product.priceHtg - b.product.priceHtg || a.product.id.localeCompare(b.product.id));
  const selected = scored.slice(0, 3);
  return selected.map(({ product }, i) => ({ ...product, position: i + 1,
    priceDifferenceHtg: product.priceHtg - selected[0].product.priceHtg,
    matchedTerms: [...terms, ...preferences].filter(t => normalized(`${product.title} ${product.description}`).includes(t)).filter((t, i, a) => a.indexOf(t) === i) }));
}
