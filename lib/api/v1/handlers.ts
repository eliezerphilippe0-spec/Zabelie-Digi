/**
 * Zabelie — API v1, les neuf handlers.
 * =============================================================================
 * Les contrats vivent dans `schemas.ts` ; ce fichier les SERT. Il a été écrit
 * le 2026-08-22, quatre semaines après les schémas, parce que l'inventaire
 * `docs/44` a mesuré ce que personne n'avait vu : neuf endpoints, 28 tests
 * verts, et **aucune route HTTP**. Les contrats étaient prouvés et n'avaient
 * jamais répondu à une requête.
 *
 * ── CE QUI EST DÉLIBÉRÉ ICI ─────────────────────────────────────────────────
 *
 * 1. **Le client de SESSION, jamais le service role.** Toutes les lectures
 *    passent par la RLS. Une API de lecture qui contournerait la RLS devrait
 *    ré-implémenter chaque règle d'accès à la main, et c'est exactement là que
 *    les fuites se logent.
 *
 * 2. ⚠️ **MAIS LA RLS EST UN PLANCHER, PAS UN FILTRE.** Mesuré avant d'écrire
 *    une ligne : `orders_seller_read` (`0002_rls.sql:55`) autorise un VENDEUR à
 *    lire les commandes portant sur ses produits. Un `select * from orders`
 *    avec le client de session rendrait donc, pour un vendeur, les commandes
 *    de ses acheteurs — alors que `OrderSchema` est documenté « sortie
 *    acheteur ». `get_order` et `get_user_orders` filtrent donc
 *    EXPLICITEMENT sur `buyer_id`. La RLS empêche de lire ce qui ne nous
 *    regarde pas ; elle ne dit pas ce qu'on a demandé.
 *
 * 3. **`not_found` plutôt que `forbidden` sur une commande d'autrui.**
 *    Répondre « interdit » confirmerait l'existence de la référence, et
 *    `ZB-YYMMDD-XXXXX` est court : un attaquant qui distingue « n'existe pas »
 *    de « existe mais pas à toi » énumère. Les deux cas rendent donc la même
 *    réponse. Ce n'est pas une approximation, c'est le choix.
 *
 * 4. **La sortie est VALIDÉE avant de partir** (dans la route, pas ici). Un
 *    handler qui rendrait une forme non conforme produit une erreur `internal`
 *    et un journal, jamais une réponse approximative. C'est toute la raison
 *    d'être des schémas : « le type reste vrai sur le papier et la réponse part
 *    quand même » est le défaut qu'ils existent pour empêcher.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { decoderCurseur, encoderCurseur } from "./cursor";
import {
  API_V1_SEARCHABLE_KINDS,
  isProductKind,
  isTrackedStockKind,
} from "@/lib/product-kind";
import type {
  CheckInventoryInput,
  CompareProductsInput,
  GetDeliveryTermsInput,
  GetOrderInput,
  GetProductInput,
  GetReviewsInput,
  GetSellerInput,
  GetUserOrdersInput,
  SearchProductsInput,
} from "./schemas";

/** Erreur portée jusqu'à la route, qui la traduit en réponse normalisée. */
export class ErreurApi extends Error {
  constructor(
    readonly code:
      | "invalid_input"
      | "unauthenticated"
      | "forbidden"
      | "not_found"
      | "rate_limited"
      | "unsupported_state"
      | "internal",
    message: string,
    readonly field?: string
  ) {
    super(message);
  }
}

export type Contexte = {
  supabase: SupabaseClient;
  /** `null` quand personne n'est connecté — les endpoints publics l'acceptent. */
  userId: string | null;
};

/** Exige une session. Les deux endpoints de commande passent par là. */
function exigerUtilisateur(ctx: Contexte): string {
  if (!ctx.userId) {
    throw new ErreurApi("unauthenticated", "Authentification requise.");
  }
  return ctx.userId;
}

// ═══════════════════════════ Projections ════════════════════════════════════

const COLONNES_PRODUIT =
  "id, slug, title, description, kind, category, price_htg, cover_url, " +
  "seller_id, rating_count, rating_sum, in_stock, created_at";

type LigneProduit = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  kind: string;
  category: string | null;
  price_htg: number;
  cover_url: string | null;
  seller_id: string;
  rating_count: number;
  rating_sum: number;
  in_stock: boolean;
  created_at: string;
};

/**
 * Moyenne des avis. `null` quand il n'y en a aucun — **jamais 0**.
 *
 * Le schéma l'impose (`ratingAverage: z.number().min(1).max(5).nullable()`) et
 * la raison est écrite à côté : `0` se lirait « mauvais » alors qu'il veut dire
 * « on ne sait pas ». Un modèle qui recevrait 0 dirait à un acheteur que le
 * produit est mal noté.
 */
function moyenne(sum: number, count: number): number | null {
  if (count <= 0) return null;
  const m = sum / count;
  // Borné : le schéma refuse hors [1,5], et un agrégat corrompu ferait échouer
  // la réponse entière plutôt que de mentir. On ne CORRIGE pas ici — on laisse
  // la sortie échouer, c'est le contrat.
  return Math.round(m * 100) / 100;
}

function resume(p: LigneProduit) {
  return {
    id: p.id,
    slug: p.slug,
    kind: p.kind,
    priceHtg: p.price_htg,
    currency: "HTG" as const,
    category: p.category,
    coverUrl: p.cover_url,
    sellerId: p.seller_id,
    ratingCount: p.rating_count,
    ratingAverage: moyenne(p.rating_sum, p.rating_count),
    inStock: p.in_stock,
    untrusted: { title: p.title, description: p.description },
  };
}

/** Décode un curseur ou refuse. Voir `cursor.ts` pour pourquoi jamais `null`. */
function cleDepuisCurseur(curseur: string | undefined) {
  if (curseur === undefined) return null;
  const cle = decoderCurseur(curseur);
  if (!cle) {
    throw new ErreurApi(
      "invalid_input",
      "Curseur illisible. N'en construisez pas : reprenez `nextCursor` tel quel.",
      "cursor"
    );
  }
  return cle;
}

// ═══════════════════════════ 1. search_products ═════════════════════════════

export async function searchProducts(
  input: z.infer<typeof SearchProductsInput>,
  ctx: Contexte
) {
  const cle = cleDepuisCurseur(input.cursor);

  let q = ctx.supabase
    .from("products")
    .select(COLONNES_PRODUIT)
    .eq("status", "published")
    // ⚠️ La v1 n'expose PAS les prestations (décision porteur 2026-08-01,
    // `lib/product-kind.ts`). La liste vient du module, jamais d'un littéral.
    .in("kind", [...API_V1_SEARCHABLE_KINDS])
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    // +1 : la ligne excédentaire dit s'il existe une page suivante, sans
    // second appel et sans `count` coûteux.
    .limit(input.limit + 1);

  if (input.query) {
    // `%` et `_` sont des JOKERS pour `ilike` : une recherche « 100% coton »
    // deviendrait « tout ce qui commence par 100 ». Échappés, donc.
    const motif = input.query.replace(/[\\%_]/g, (c) => `\\${c}`);
    q = q.ilike("title", `%${motif}%`);
  }
  if (input.kind) q = q.eq("kind", input.kind);
  if (input.category) q = q.eq("category", input.category);
  if (input.minPriceHtg !== undefined) q = q.gte("price_htg", input.minPriceHtg);
  if (input.maxPriceHtg !== undefined) q = q.lte("price_htg", input.maxPriceHtg);
  if (cle) {
    q = q.or(
      `created_at.lt.${cle.t},and(created_at.eq.${cle.t},id.lt.${cle.i})`
    );
  }

  const { data, error } = await q;
  if (error) throw new ErreurApi("internal", "Lecture du catalogue échouée.");

  const lignes = (data ?? []) as unknown as LigneProduit[];
  const encore = lignes.length > input.limit;
  const page = encore ? lignes.slice(0, input.limit) : lignes;
  const dernier = page[page.length - 1];

  return {
    type: "product_results" as const,
    results: page.map(resume),
    nextCursor:
      encore && dernier ? encoderCurseur({ t: dernier.created_at, i: dernier.id }) : null,
    // ⚠️ `null` ASSUMÉ, pas un oubli. Un `count: 'exact'` sur chaque recherche
    // scanne la table à chaque appel ; une estimation inventée serait pire
    // qu'une absence. Le schéma autorise `null` précisément pour ça.
    totalEstimate: null,
  };
}

// ═══════════════════════════ 2. get_product ═════════════════════════════════

export async function getProduct(
  input: z.infer<typeof GetProductInput>,
  ctx: Contexte
) {
  let q = ctx.supabase
    .from("products")
    .select(`${COLONNES_PRODUIT}, delivery_days, service_includes`)
    .eq("status", "published");
  q = input.id ? q.eq("id", input.id) : q.eq("slug", input.slug!);

  const { data, error } = await q.maybeSingle();
  if (error) throw new ErreurApi("internal", "Lecture du produit échouée.");
  if (!data) throw new ErreurApi("not_found", "Produit introuvable.");

  const p = data as unknown as LigneProduit & {
    delivery_days: number | null;
    service_includes: string[] | null;
  };

  return {
    type: "product_detail" as const,
    product: {
      ...resume(p),
      /* ⚠️ `0` DEVIENT `null`, ET CE N'EST PAS UNE PERTE D'INFORMATION —
       * c'est le contrat. `declaredDeliveryDays` est
       * `z.number().int().positive().nullable()` : zéro n'y est PAS
       * représentable. Depuis `0088` (appliquée le 2026-08-22), `0` signifie
       * « livré le jour même » pour un service ou un fichier — une valeur qui
       * n'existait pas quand ces schémas ont été écrits.
       *
       * Rendre `0` ferait échouer la sortie entière ; le laisser passer
       * exigerait de modifier un schéma v1, donc `/v2/`. On rend donc `null`
       * (« pas de délai déclaré »), et `get_delivery_terms` porte la nuance
       * complète via `source`. C'est le seul endroit du fichier où la v1 en
       * dit moins que la base, et il est écrit plutôt que subi. */
      declaredDeliveryDays:
        typeof p.delivery_days === "number" && p.delivery_days > 0
          ? p.delivery_days
          : null,
      serviceIncludes: p.service_includes,
      createdAt: new Date(p.created_at).toISOString(),
    },
  };
}

// ═════════════════════════ 3. compare_products ══════════════════════════════

export async function compareProducts(
  input: z.infer<typeof CompareProductsInput>,
  ctx: Contexte
) {
  const { data, error } = await ctx.supabase
    .from("products")
    .select(COLONNES_PRODUIT)
    .eq("status", "published")
    .in("id", input.ids);
  if (error) throw new ErreurApi("internal", "Lecture des produits échouée.");

  const lignes = (data ?? []) as unknown as LigneProduit[];
  const trouves = new Set(lignes.map((p) => p.id));

  /* ⚠️ L'ORDRE DEMANDÉ EST RESPECTÉ. PostgREST rend les lignes dans l'ordre du
   * stockage, pas dans celui du `in (…)`. Une comparaison dont les colonnes
   * ne sont pas dans l'ordre demandé se lit de travers — et pour un lecteur
   * automatique, « le premier » a un sens. */
  const ordonnes = input.ids
    .map((id) => lignes.find((p) => p.id === id))
    .filter((p): p is LigneProduit => p !== undefined);

  /* ⚠️ ET SI MOINS DE DEUX SURVIVENT, ON REFUSE. `CompareProductsOutput` exige
   * `.min(COMPARE_MIN)` : rendre une comparaison à un seul produit ferait
   * échouer la validation de sortie en `internal`, ce qui est un mensonge sur
   * la cause. La vraie cause est que la demande n'est plus satisfaisable. */
  if (ordonnes.length < 2) {
    throw new ErreurApi(
      "not_found",
      "Moins de deux produits comparables : au moins un identifiant est introuvable ou non publié.",
      "ids"
    );
  }

  return {
    type: "product_comparison" as const,
    products: ordonnes.map(resume),
    notFound: input.ids.filter((id) => !trouves.has(id)),
  };
}

// ═══════════════════════════ 4. get_seller ══════════════════════════════════

export async function getSeller(
  input: z.infer<typeof GetSellerInput>,
  ctx: Contexte
) {
  /* ⚠️ LA LISTE BLANCHE DE COLONNES N'EST PAS UN CONFORT DE PERFORMANCE.
   * `0015` accorde `select` à `anon` sur SEPT colonnes de `profiles`
   * seulement. Demander `*` ici échouerait — ou, pire, réussirait un jour où
   * quelqu'un élargirait le GRANT, et exposerait alors ce que ce GRANT
   * protégeait. On nomme donc exactement ce qu'on lit.
   *
   * `tier` est exposé (le schéma le prévoit) ; le TAUX de commission jamais. */
  const { data: prof, error } = await ctx.supabase
    .from("profiles")
    .select("id, display_name, bio, avatar_url, tier, created_at")
    .eq("id", input.id)
    .maybeSingle();
  if (error) throw new ErreurApi("internal", "Lecture du vendeur échouée.");
  if (!prof) throw new ErreurApi("not_found", "Vendeur introuvable.");

  const p = prof as unknown as {
    id: string;
    display_name: string;
    bio: string | null;
    avatar_url: string | null;
    tier: string;
    created_at: string;
  };

  /* Agrégats calculés sur les produits PUBLIÉS seulement : un brouillon n'est
   * pas une offre, et le compter gonflerait la vitrine d'un vendeur. */
  const { data: prods, error: ePro } = await ctx.supabase
    .from("products")
    .select("rating_count, rating_sum, sales_count")
    .eq("seller_id", input.id)
    .eq("status", "published");
  if (ePro) throw new ErreurApi("internal", "Lecture du catalogue vendeur échouée.");

  const lignes = (prods ?? []) as unknown as {
    rating_count: number;
    rating_sum: number;
    sales_count: number;
  }[];
  const rc = lignes.reduce((n, l) => n + l.rating_count, 0);
  const rs = lignes.reduce((n, l) => n + l.rating_sum, 0);

  return {
    type: "seller_profile" as const,
    seller: {
      id: p.id,
      tier: p.tier,
      memberSince: new Date(p.created_at).toISOString(),
      productCount: lignes.length,
      salesCount: lignes.reduce((n, l) => n + l.sales_count, 0),
      ratingCount: rc,
      ratingAverage: moyenne(rs, rc),
      untrusted: {
        displayName: p.display_name,
        bio: p.bio,
        avatarUrl: p.avatar_url,
      },
    },
  };
}

// ═══════════════════════════ 5. get_reviews ═════════════════════════════════

export async function getReviews(
  input: z.infer<typeof GetReviewsInput>,
  ctx: Contexte
) {
  const cle = cleDepuisCurseur(input.cursor);

  /* Le produit est lu D'ABORD, et pour deux raisons : ses agrégats sont la
   * réponse à « combien d'avis », et son absence doit rendre `not_found`
   * plutôt qu'une liste vide. « Aucun avis » et « ce produit n'existe pas »
   * sont deux faits différents. */
  const { data: prod, error: eProd } = await ctx.supabase
    .from("products")
    .select("id, rating_count, rating_sum")
    .eq("id", input.productId)
    .eq("status", "published")
    .maybeSingle();
  if (eProd) throw new ErreurApi("internal", "Lecture du produit échouée.");
  if (!prod) throw new ErreurApi("not_found", "Produit introuvable.");
  const agg = prod as unknown as { rating_count: number; rating_sum: number };

  /* ⚠️ `buyer_id` N'EST PAS SÉLECTIONNÉ, ET C'EST LE POINT. `product_reviews`
   * porte un `order_id` unique : exposer l'auteur d'un avis reviendrait à
   * publier qui a acheté quoi. Ne pas le demander vaut mieux que le demander
   * puis penser à ne pas le rendre. */
  let q = ctx.supabase
    .from("product_reviews")
    .select("id, rating, comment, created_at")
    .eq("product_id", input.productId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(input.limit + 1);
  if (cle) {
    q = q.or(`created_at.lt.${cle.t},and(created_at.eq.${cle.t},id.lt.${cle.i})`);
  }

  const { data, error } = await q;
  if (error) throw new ErreurApi("internal", "Lecture des avis échouée.");

  const lignes = (data ?? []) as unknown as {
    id: string;
    rating: number;
    comment: string | null;
    created_at: string;
  }[];
  const encore = lignes.length > input.limit;
  const page = encore ? lignes.slice(0, input.limit) : lignes;
  const dernier = page[page.length - 1];

  return {
    type: "product_reviews" as const,
    productId: input.productId,
    ratingCount: agg.rating_count,
    ratingAverage: moyenne(agg.rating_sum, agg.rating_count),
    reviews: page.map((r) => ({
      id: r.id,
      rating: r.rating,
      createdAt: new Date(r.created_at).toISOString(),
      untrusted: { comment: r.comment },
    })),
    nextCursor:
      encore && dernier ? encoderCurseur({ t: dernier.created_at, i: dernier.id }) : null,
  };
}

// ═════════════════════════ 6. check_inventory ═══════════════════════════════

export async function checkInventory(
  input: z.infer<typeof CheckInventoryInput>,
  ctx: Contexte
) {
  const { data: prod, error } = await ctx.supabase
    .from("products")
    .select("id, kind, in_stock")
    .eq("id", input.productId)
    .eq("status", "published")
    .maybeSingle();
  if (error) throw new ErreurApi("internal", "Lecture du produit échouée.");
  if (!prod) throw new ErreurApi("not_found", "Produit introuvable.");
  const p = prod as unknown as { id: string; kind: string; in_stock: boolean };

  const maintenant = new Date().toISOString();

  /* ⚠️ `totalAvailable: null` N'EST PAS `0`, et le schéma le dit : `null` =
   * « ce produit ne suit pas de stock » (un fichier ne s'épuise pas), `0` =
   * « suivi, et il n'en reste aucun ». Confondre les deux ferait annoncer
   * « épuisé » un fichier téléchargeable à l'infini.
   *
   * Le test du type passe par `lib/product-kind.ts` — comparer un type de
   * produit hors de ce module est interdit et vérifié
   * (`tests/product-kind-discipline.test.ts`). */
  /* ⚠️ `p.kind` arrive de PostgREST en `string`. Le garde le NARROW avant tout
   * usage : un `as ProductKind` mentirait, et une valeur d'énumération ajoutée
   * en SQL sans l'être dans le module passerait sans bruit.
   *
   * Un type inconnu est traité comme non suivi — `totalAvailable: null`,
   * « on ne sait pas » — jamais comme un zéro qui se lirait « épuisé ». */
  if (!isProductKind(p.kind) || !isTrackedStockKind(p.kind)) {
    return {
      type: "inventory_status" as const,
      productId: p.id,
      inStock: p.in_stock,
      totalAvailable: null,
      variants: [],
      checkedAt: maintenant,
    };
  }

  const { data: vars, error: eVar } = await ctx.supabase
    .from("zabelie_product_variants")
    .select("id, options, active, zabelie_stock(quantity_available)")
    .eq("product_id", input.productId)
    .eq("active", true)
    .order("position");
  if (eVar) throw new ErreurApi("internal", "Lecture du stock échouée.");

  const lignes = (vars ?? []) as unknown as {
    id: string;
    options: Record<string, string> | null;
    zabelie_stock: { quantity_available: number } | { quantity_available: number }[] | null;
  }[];

  const variants = lignes.map((v) => {
    // PostgREST rend une relation 1-1 tantôt en objet, tantôt en tableau selon
    // la façon dont il infère la cardinalité. Les deux formes sont traitées :
    // supposer l'une des deux marcherait jusqu'au jour où elle change.
    const s = Array.isArray(v.zabelie_stock) ? v.zabelie_stock[0] : v.zabelie_stock;
    return {
      id: v.id,
      available: s?.quantity_available ?? 0,
      untrusted: {
        label: Object.entries(v.options ?? {})
          .map(([k, val]) => `${k}: ${val}`)
          .join(" · "),
      },
    };
  });

  const total = variants.reduce((n, v) => n + v.available, 0);

  return {
    type: "inventory_status" as const,
    productId: p.id,
    // Le drapeau du produit ET le stock réel : un article marqué disponible
    // dont toutes les variantes sont à zéro n'est pas disponible.
    inStock: p.in_stock && total > 0,
    totalAvailable: total,
    variants,
    checkedAt: maintenant,
  };
}

// ═══════════════════════ 7. get_delivery_terms ══════════════════════════════

export async function getDeliveryTerms(
  input: z.infer<typeof GetDeliveryTermsInput>,
  ctx: Contexte
) {
  const { data, error } = await ctx.supabase
    .from("products")
    .select("id, kind, delivery_days")
    .eq("id", input.productId)
    .eq("status", "published")
    .maybeSingle();
  if (error) throw new ErreurApi("internal", "Lecture du produit échouée.");
  if (!data) throw new ErreurApi("not_found", "Produit introuvable.");
  const p = data as unknown as { id: string; kind: string; delivery_days: number | null };

  /* ⚠️ `0` = LE JOUR MÊME depuis `0088`, et ce n'est pas « non déclaré ».
   * `declaredDays` est `.positive()` au schéma, donc zéro n'y tient pas — mais
   * `source` peut le dire, et c'est exactement ce pour quoi ce champ existe :
   * « sans lui, "pas de zone déclarée" et "le vendeur n'a pas pu la déclarer"
   * seraient le même vide ». Un vendeur qui a déclaré « jour même » A déclaré
   * quelque chose. */
  const aDeclare = typeof p.delivery_days === "number";

  return {
    type: "delivery_terms" as const,
    productId: p.id,
    source: aDeclare ? ("seller_declared" as const) : ("not_declared" as const),
    declaredDays: aDeclare && p.delivery_days! > 0 ? p.delivery_days : null,
    // Aucune colonne ne porte la zone à ce jour — structurellement `null`.
    zone: null,
    platformFulfilled: false as const,
  };
}

// ═══════════════════════════ 8. get_order ═══════════════════════════════════

const COLONNES_COMMANDE =
  "id, order_ref, status, amount_htg, created_at, " +
  "product:products!orders_product_id_fkey(id, slug, kind, title)";

type LigneCommande = {
  id: string;
  order_ref: string;
  status: string;
  amount_htg: number;
  created_at: string;
  product:
    | { id: string; slug: string; kind: string; title: string }
    | { id: string; slug: string; kind: string; title: string }[]
    | null;
};

function commande(o: LigneCommande) {
  const prod = Array.isArray(o.product) ? o.product[0] : o.product;
  if (!prod) {
    /* Une commande sans produit est impossible en base — `product_id` est
     * `not null references products on delete restrict`. Si ça arrive, c'est
     * que la jointure a été filtrée par la RLS, et rendre une forme mutilée
     * serait pire que d'échouer. */
    throw new ErreurApi("internal", "Commande sans produit lisible.");
  }
  return {
    id: o.id,
    ref: o.order_ref,
    status: o.status,
    /* `fulfillmentStatus` est ABSENT, et c'est le cas normal — pas un oubli.
     * Le schéma le veut `.optional()` et non `.nullable()` : `null` dirait
     * « pas d'expédition », `undefined` dit « cette base ne sait pas encore
     * répondre ». `0043` est appliquée mais le suivi n'est ouvert que pour une
     * partie des commandes ; joindre `zabelie_fulfillment` ici demanderait une
     * requête par commande dans `get_user_orders`. À rebrancher quand le suivi
     * sera systématique — d'ici là, l'absence est honnête. */
    amountHtg: o.amount_htg,
    currency: "HTG" as const,
    createdAt: new Date(o.created_at).toISOString(),
    product: {
      id: prod.id,
      slug: prod.slug,
      kind: prod.kind,
      untrusted: { title: prod.title },
    },
  };
}

export async function getOrder(
  input: z.infer<typeof GetOrderInput>,
  ctx: Contexte
) {
  const userId = exigerUtilisateur(ctx);

  let q = ctx.supabase
    .from("orders")
    .select(COLONNES_COMMANDE)
    // ⚠️ EXPLICITE, PAS SEULEMENT LA RLS. Voir l'en-tête du fichier :
    // `orders_seller_read` laisserait un vendeur lire ici la commande de son
    // acheteur, et `OrderSchema` est une sortie ACHETEUR.
    .eq("buyer_id", userId);
  q = input.id ? q.eq("id", input.id) : q.eq("order_ref", input.ref!);

  const { data, error } = await q.maybeSingle();
  if (error) throw new ErreurApi("internal", "Lecture de la commande échouée.");
  // « n'existe pas » et « pas à vous » rendent la MÊME réponse : sinon la
  // référence, courte, s'énumère.
  if (!data) throw new ErreurApi("not_found", "Commande introuvable.");

  return { type: "order_status" as const, order: commande(data as unknown as LigneCommande) };
}

// ════════════════════════ 9. get_user_orders ════════════════════════════════

export async function getUserOrders(
  input: z.infer<typeof GetUserOrdersInput>,
  ctx: Contexte
) {
  const userId = exigerUtilisateur(ctx);
  const cle = cleDepuisCurseur(input.cursor);

  let q = ctx.supabase
    .from("orders")
    .select(COLONNES_COMMANDE)
    .eq("buyer_id", userId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(input.limit + 1);
  if (input.status) q = q.eq("status", input.status);
  if (cle) {
    q = q.or(`created_at.lt.${cle.t},and(created_at.eq.${cle.t},id.lt.${cle.i})`);
  }

  const { data, error } = await q;
  if (error) throw new ErreurApi("internal", "Lecture des commandes échouée.");

  const lignes = (data ?? []) as unknown as LigneCommande[];
  const encore = lignes.length > input.limit;
  const page = encore ? lignes.slice(0, input.limit) : lignes;
  const dernier = page[page.length - 1];

  return {
    type: "order_list" as const,
    orders: page.map(commande),
    nextCursor:
      encore && dernier ? encoderCurseur({ t: dernier.created_at, i: dernier.id }) : null,
  };
}

// ══════════════════ Le registre des handlers — un seul endroit ══════════════

/**
 * ⚠️ CE REGISTRE SE CROISE AVEC `V1_ENDPOINTS`, dans les deux sens
 * (`tests/api-v1-routes.test.ts`).
 *
 * Un handler sans contrat ne serait validé par rien ; un contrat sans handler
 * est exactement l'état qu'on répare aujourd'hui — neuf endpoints prouvés qui
 * n'avaient jamais répondu. Le croisement échoue dans les DEUX directions,
 * parce qu'une liste qui ne sait que grandir devient une conformité par usure.
 */
export const V1_HANDLERS = {
  search_products: searchProducts,
  get_product: getProduct,
  compare_products: compareProducts,
  get_seller: getSeller,
  get_reviews: getReviews,
  check_inventory: checkInventory,
  get_delivery_terms: getDeliveryTerms,
  get_order: getOrder,
  get_user_orders: getUserOrders,
} as const;

/** Endpoints qui exigent une session. Croisé avec les handlers par le test. */
export const V1_AUTHENTIFIES = new Set(["get_order", "get_user_orders"]);
