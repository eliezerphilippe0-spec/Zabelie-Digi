import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { decoderCurseur, encoderCurseur } from "./cursor";
import { ErreurApi } from "./handlers";
import { MoneyHtgSchema, ProductKindSchema, UuidSchema } from "./schemas";
import type { Scope } from "@/lib/api-keys";
import { siteUrl } from "@/lib/site-url";

/**
 * API VENDEUR v1 — « brancher son site sur Zabelie » (brique B, 2026-10-03).
 * =============================================================================
 * Servie par `app/api/v1/seller/[endpoint]/route.ts`, authentifiée par CLÉ
 * D'API (0121), jamais par cookie. Mêmes règles que l'API publique v1 :
 * registre = liste blanche, entrée ET sortie validées, montants en GOURDES
 * ENTIÈRES, pagination par curseur (keyset).
 *
 * ⚠️ CLOISONNEMENT. Les handlers lisent avec le client de SERVICE (la RLS ne
 * connaît pas les clés d'API). Le cloisonnement repose donc entièrement sur
 * le filtre `seller_id = <vendeur de la clé>`, présent dans CHAQUE requête —
 * `tests/api-seller.test.ts` l'exige requête par requête.
 *
 * Les `ErreurApi` levées ici portent une CLÉ de `messages.ts`, jamais une
 * phrase : la route la traduit dans la langue de l'appelant (fr, ht, en, es).
 *
 * ⚠️ AUCUNE DONNÉE ACHETEUR. Une vente rend sa référence, son produit, son
 * montant, son statut — jamais le nom, le téléphone ni l'adresse de
 * l'acheteur. Le site du vendeur n'en a pas besoin pour se synchroniser.
 *
 * ⚠️ L'ARGENT RESTE SUR ZABELIE. `create_product_link` rend l'adresse de la
 * fiche sur zabelie.com : l'acheteur y paie, l'escrow s'applique, le prix est
 * celui de la base. Le site externe ne voit jamais un paiement.
 */

const Limite = z.number().int().min(1).max(50).default(20);
const Curseur = z.string().min(1).max(200).optional();

export const PRODUCT_STATUSES = ["draft", "published", "archived"] as const;
export const SALE_STATUSES = ["paid", "delivered", "refunded", "disputed"] as const;

export const SellerProductsInput = z.object({
  limit: Limite,
  cursor: Curseur,
  status: z.enum(PRODUCT_STATUSES).optional(),
}).strict();

export const SellerProductsOutput = z.object({
  type: z.literal("seller_products"),
  results: z.array(z.object({
    id: UuidSchema,
    slug: z.string(),
    kind: ProductKindSchema,
    status: z.enum(PRODUCT_STATUSES),
    priceHtg: MoneyHtgSchema,
    currency: z.literal("HTG"),
    inStock: z.boolean(),
    coverUrl: z.string().url().nullable(),
    /** Adresse de la fiche — l'acheteur y paie. `null` tant que non publiée. */
    url: z.string().url().nullable(),
    createdAt: z.string(),
    untrusted: z.object({ title: z.string() }),
  })),
  nextCursor: z.string().nullable(),
});

export const SellerSalesInput = z.object({
  limit: Limite,
  cursor: Curseur,
  status: z.enum(SALE_STATUSES).optional(),
}).strict();

export const SellerSalesOutput = z.object({
  type: z.literal("seller_sales"),
  results: z.array(z.object({
    id: UuidSchema,
    orderRef: z.string(),
    productId: UuidSchema,
    /** Ce que l'acheteur a payé, remise déduite. Pas le net vendeur. */
    amountHtg: MoneyHtgSchema,
    discountHtg: MoneyHtgSchema,
    currency: z.literal("HTG"),
    status: z.enum(SALE_STATUSES),
    /** `false` = paiement d'essai (bac à sable) : à ne JAMAIS traiter comme une vente réelle. */
    live: z.boolean(),
    createdAt: z.string(),
  })),
  nextCursor: z.string().nullable(),
});

export const CreateProductLinkInput = z.object({ productId: UuidSchema }).strict();

export const CreateProductLinkOutput = z.object({
  type: z.literal("product_link"),
  productId: UuidSchema,
  url: z.string().url(),
});

/** Le registre. Chaque endpoint déclare la PORTÉE qu'il exige. */
export const SELLER_ENDPOINTS = {
  seller_products: { input: SellerProductsInput, output: SellerProductsOutput, scope: "products:read" },
  seller_sales: { input: SellerSalesInput, output: SellerSalesOutput, scope: "sales:read" },
  create_product_link: { input: CreateProductLinkInput, output: CreateProductLinkOutput, scope: "links:write" },
} as const satisfies Record<string, { input: z.ZodTypeAny; output: z.ZodTypeAny; scope: Scope }>;

export type SellerEndpointName = keyof typeof SELLER_ENDPOINTS;

export type ContexteVendeur = { admin: SupabaseClient; sellerId: string };

function cle(curseur: string | undefined) {
  if (curseur === undefined) return null;
  const c = decoderCurseur(curseur);
  if (!c) throw new ErreurApi("invalid_input", "cursor_invalid", "cursor");
  return c;
}

/** Keyset `(created_at, id)` décroissant : la page suivante commence strictement après la dernière ligne vue. */
function apres(c: { t: string; i: string }) {
  return `created_at.lt.${c.t},and(created_at.eq.${c.t},id.lt.${c.i})`;
}

function urlFiche(slug: string) {
  return `${siteUrl()}/produit/${encodeURIComponent(slug)}`;
}

export async function sellerProducts(input: z.infer<typeof SellerProductsInput>, ctx: ContexteVendeur) {
  const c = cle(input.cursor);
  let q = ctx.admin
    .from("products")
    .select("id, slug, title, kind, status, price_htg, in_stock, cover_url, created_at")
    .eq("seller_id", ctx.sellerId);
  if (input.status) q = q.eq("status", input.status);
  if (c) q = q.or(apres(c));
  const { data, error } = await q.order("created_at", { ascending: false }).order("id", { ascending: false }).limit(input.limit + 1);
  if (error || !data) throw new ErreurApi("internal", "read_failed");
  const page = data.slice(0, input.limit);
  const dernier = page.at(-1);
  return {
    type: "seller_products" as const,
    results: page.map((p) => ({
      id: p.id, slug: p.slug, kind: p.kind, status: p.status, priceHtg: p.price_htg, currency: "HTG" as const,
      inStock: p.in_stock, coverUrl: p.cover_url, url: p.status === "published" ? urlFiche(p.slug) : null,
      createdAt: p.created_at, untrusted: { title: p.title },
    })),
    nextCursor: data.length > input.limit && dernier ? encoderCurseur({ t: dernier.created_at, i: dernier.id }) : null,
  };
}

export async function sellerSales(input: z.infer<typeof SellerSalesInput>, ctx: ContexteVendeur) {
  const c = cle(input.cursor);
  let q = ctx.admin
    .from("orders")
    .select("id, order_ref, product_id, amount_htg, discount_htg, status, zabelie_payment_is_live, created_at, products!inner(seller_id)")
    .eq("products.seller_id", ctx.sellerId)
    .in("status", input.status ? [input.status] : [...SALE_STATUSES]);
  if (c) q = q.or(apres(c));
  const { data, error } = await q.order("created_at", { ascending: false }).order("id", { ascending: false }).limit(input.limit + 1);
  if (error || !data) throw new ErreurApi("internal", "read_failed");
  const page = data.slice(0, input.limit);
  const dernier = page.at(-1);
  return {
    type: "seller_sales" as const,
    results: page.map((o) => ({
      id: o.id, orderRef: o.order_ref, productId: o.product_id, amountHtg: o.amount_htg, discountHtg: o.discount_htg,
      currency: "HTG" as const, status: o.status, live: o.zabelie_payment_is_live, createdAt: o.created_at,
    })),
    nextCursor: data.length > input.limit && dernier ? encoderCurseur({ t: dernier.created_at, i: dernier.id }) : null,
  };
}

export async function createProductLink(input: z.infer<typeof CreateProductLinkInput>, ctx: ContexteVendeur) {
  const { data, error } = await ctx.admin
    .from("products")
    .select("id, slug, status, in_stock")
    .eq("id", input.productId)
    .eq("seller_id", ctx.sellerId)
    .maybeSingle();
  if (error) throw new ErreurApi("internal", "read_failed");
  // Le produit d'une autre boutique rend 404, comme un produit inexistant.
  if (!data) throw new ErreurApi("not_found", "product_not_found", "productId");
  if (data.status !== "published") throw new ErreurApi("unsupported_state", "product_not_published", "productId");
  if (!data.in_stock) throw new ErreurApi("unsupported_state", "product_out_of_stock", "productId");
  return { type: "product_link" as const, productId: data.id, url: urlFiche(data.slug) };
}

export const SELLER_HANDLERS: { [K in SellerEndpointName]: (i: never, c: ContexteVendeur) => Promise<unknown> } = {
  seller_products: sellerProducts,
  seller_sales: sellerSales,
  create_product_link: createProductLink,
};
