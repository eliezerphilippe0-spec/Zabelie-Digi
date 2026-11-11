import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { decoderCurseur, encoderCurseur } from "./cursor";
import { ErreurApi } from "./handlers";
import { MoneyHtgSchema, ProductKindSchema, UuidSchema } from "./schemas";
import type { Scope } from "@/lib/api-keys";
import { siteUrl } from "@/lib/site-url";
import { rateLimit } from "@/lib/zabelie-rate-limit";
import { isProductKind } from "@/lib/product-kind";
import { cheminFichePreparee, descriptionPreparee, titrePrepare, FICHES_PREPAREES_PAR_HEURE } from "@/lib/fiche-preparee";

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
 *
 * ⚠️ UNE SEULE OPÉRATION DÉPOSE QUELQUE CHOSE : `prepare_product` (lot 3b,
 * 0171), et elle ne crée PAS de produit. Elle dépose une fiche PRÉPARÉE, que
 * le vendeur relit, dont il accepte lui-même la politique, et qu'il envoie par
 * le formulaire habituel. Elle est marquée `ecrit: true` au registre : c'est
 * ce drapeau, et lui seul, qui retire à l'outil MCP son étiquette « lecture
 * seule ». Les autres opérations ne font que lire.
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

export const PrepareProductInput = z.object({
  kind: ProductKindSchema,
  title: z.string().min(1).max(140),
  description: z.string().max(5000).optional(),
  /** Prix PROPOSÉ, gourdes entières. Le vendeur le confirme ou le change dans le formulaire. */
  priceHtg: MoneyHtgSchema.max(2147483647).optional(),
}).strict();

export const PrepareProductOutput = z.object({
  type: z.literal("prepared_product"),
  id: UuidSchema,
  kind: ProductKindSchema,
  /** Toujours `false` : rien n'est créé ni publié tant que le vendeur n'a pas relu et envoyé. */
  published: z.literal(false),
  /** Adresse à remettre AU VENDEUR : il y relit la fiche, accepte la politique et l'envoie. */
  url: z.string().url(),
  expiresAt: z.string(),
});

/** Le registre. Chaque endpoint déclare la PORTÉE qu'il exige. `ecrit` : l'opération dépose quelque chose. */
export const SELLER_ENDPOINTS = {
  seller_products: { input: SellerProductsInput, output: SellerProductsOutput, scope: "products:read" },
  seller_sales: { input: SellerSalesInput, output: SellerSalesOutput, scope: "sales:read" },
  create_product_link: { input: CreateProductLinkInput, output: CreateProductLinkOutput, scope: "links:write" },
  prepare_product: { input: PrepareProductInput, output: PrepareProductOutput, scope: "products:prepare", ecrit: true },
} as const satisfies Record<string, { input: z.ZodTypeAny; output: z.ZodTypeAny; scope: Scope; ecrit?: true }>;

/** Vrai pour les seules opérations qui déposent quelque chose. Lu par le serveur MCP pour ses annotations. */
export function operationEcrit(nom: string): boolean {
  const contrat = (SELLER_ENDPOINTS as Record<string, { ecrit?: true }>)[nom];
  return Object.prototype.hasOwnProperty.call(SELLER_ENDPOINTS, nom) && contrat?.ecrit === true;
}

export type SellerEndpointName = keyof typeof SELLER_ENDPOINTS;

/** `keyId` : la clé qui appelle. Seul `prepare_product` s'en sert, pour dire au vendeur d'où vient la fiche. */
export type ContexteVendeur = { admin: SupabaseClient; sellerId: string; keyId?: string };

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
    .select("id, order_ref, product_id, amount_htg, discount_htg, status, zabelie_payment_is_live, created_at, products!orders_product_id_fkey!inner(seller_id)")
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

/**
 * Dépose une fiche PRÉPARÉE. N'écrit JAMAIS dans `products`.
 *
 * Ce que cette fonction ne fait pas, et pourquoi c'est le sujet :
 *   * elle n'accepte pas la politique des produits interdits à la place du
 *     vendeur — c'est une attestation opposable (0046), elle reste humaine ;
 *   * elle ne choisit ni rayon, ni photo, ni fichier, ni stock ;
 *   * le prix n'est qu'une PROPOSITION : celui de la fiche sera celui que le
 *     vendeur envoie, revalidé par la route de création.
 *
 * Le texte reçu est ramené à du texte (`texteSeul`) : un assistant relaie
 * souvent du HTML ou des caractères invisibles copiés d'ailleurs.
 */
export async function prepareProduct(input: z.infer<typeof PrepareProductInput>, ctx: ContexteVendeur) {
  if (!isProductKind(input.kind)) throw new ErreurApi("invalid_input", "input_invalid", "kind");
  const titre = titrePrepare(input.title);
  if (!titre) throw new ErreurApi("invalid_input", "input_invalid", "title");
  const description = descriptionPreparee(input.description);

  // Cadence par VENDEUR, toutes clés confondues : cinq clés ne font pas cinq quotas.
  if (!(await rateLimit(ctx.admin, `fiche_preparee:${ctx.sellerId}`, FICHES_PREPAREES_PAR_HEURE, 3600))) {
    throw new ErreurApi("rate_limited", "rate_limited");
  }

  const { data, error } = await ctx.admin
    .from("zabelie_fiches_preparees")
    .insert({
      seller_id: ctx.sellerId,
      api_key_id: ctx.keyId ?? null,
      kind: input.kind,
      title: titre,
      description,
      price_htg: input.priceHtg ?? null,
    })
    .select("id, kind, expires_at")
    .single();
  // ZB171 : vingt fiches attendent déjà le vendeur. Ce n'est pas une panne, c'est un état.
  if (error?.code === "ZB171") throw new ErreurApi("unsupported_state", "prepared_limit");
  if (error || !data) {
    console.error("[api/v1/seller/prepare_product] dépôt refusé", error?.code ?? "empty_response");
    throw new ErreurApi("internal", "unavailable");
  }
  const chemin = cheminFichePreparee(input.kind, data.id);
  if (!chemin) throw new ErreurApi("internal", "internal");
  return {
    type: "prepared_product" as const,
    id: data.id,
    kind: data.kind,
    published: false as const,
    url: `${siteUrl()}${chemin}`,
    expiresAt: data.expires_at,
  };
}

export const SELLER_HANDLERS: { [K in SellerEndpointName]: (i: never, c: ContexteVendeur) => Promise<unknown> } = {
  seller_products: sellerProducts,
  seller_sales: sellerSales,
  create_product_link: createProductLink,
  prepare_product: prepareProduct,
};
