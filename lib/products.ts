import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSellerIdsInZone } from "@/lib/zones";
import { PRODUCTS as SAMPLE, type ProductKind } from "@/lib/sample-data";

/**
 * Vue produit unifiée pour l'UI. Deux sources possibles :
 *   - Supabase (si configuré) — données réelles.
 *   - Données d'exemple (repli) — pour la démo sans base.
 */
export type ProductView = {
  id: string; // uuid (Supabase) ou slug (exemple)
  slug: string;
  title: string;
  creator: string;
  creatorId: string | null;
  kind: ProductKind;
  category: string;
  priceHTG: number;
  sales: number;
  ratingAvg: number | null; // null si aucun avis
  ratingCount: number;
  accent: string;
  /** Photo produit (bucket public 0039). null = repli dégradé — la colonne
      existe depuis 0001 mais n'était LUE par aucune surface : les vendeurs
      téléversaient une photo qu'aucun acheteur ne voyait. */
  coverUrl: string | null;
  blurb: string;
  deliveryDays: number | null;    // 'service' uniquement — page Fiverr
  serviceIncludes: string[];      // 'service' uniquement — checklist « inclus »
};

const ACCENTS = [
  "from-amber to-magenta",
  "from-violet to-teal",
  "from-gold to-amber",
  "from-magenta to-violet",
  "from-teal to-violet",
  "from-amber to-violet",
];

/** Dégradé déterministe à partir d'une chaîne (produits Supabase sans accent). */
function accentFor(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return ACCENTS[Math.abs(h) % ACCENTS.length];
}

export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

/**
 * Fixtures de démonstration — OPT-IN EXPLICITE, jamais un défaut.
 *
 * L'ancienne garde était `!isSupabaseConfigured()` seule : correcte en
 * production (la base y est configurée), mais elle faisait des fixtures le
 * comportement PAR DÉFAUT de tout environnement sans clés — et la landing se
 * concevait donc devant un faux catalogue au lieu de l'état réel du
 * lancement, le catalogue vide. Le drapeau inverse la charge : sans
 * `ZABELIE_DEMO_FIXTURES=true` posé consciemment, il n'y a PAS de produits
 * inventés, nulle part.
 */
export function demoFixturesEnabled(): boolean {
  return process.env.ZABELIE_DEMO_FIXTURES === "true";
}

/** Ce que le mode non configuré est autorisé à montrer. */
const demoView = (): ProductView[] => (demoFixturesEnabled() ? sampleAsView() : []);

const sampleAsView = (): ProductView[] =>
  SAMPLE.map((p) => ({
    id: p.slug,
    slug: p.slug,
    title: p.title,
    creator: p.creator,
    creatorId: null,
    kind: p.kind,
    category: p.category,
    priceHTG: p.priceHTG,
    sales: p.sales,
    ratingAvg: null,
    ratingCount: 0,
    accent: p.accent,
    coverUrl: null,
    blurb: p.blurb,
    deliveryDays: null,
    serviceIncludes: [],
  }));

type Row = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  kind: ProductKind;
  category: string | null;
  price_htg: number;
  sales_count: number;
  rating_count: number;
  rating_sum: number;
  seller_id: string;
  cover_url: string | null;
  seller: { display_name: string } | { display_name: string }[] | null;
  delivery_days: number | null;
  service_includes: string[] | null;
};

function rowAsView(r: Row): ProductView {
  const seller = Array.isArray(r.seller) ? r.seller[0] : r.seller;
  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    creator: seller?.display_name ?? "Créateur",
    creatorId: r.seller_id,
    kind: r.kind,
    category: r.category ?? "Divers",
    priceHTG: r.price_htg,
    sales: r.sales_count,
    ratingAvg:
      r.rating_count > 0
        ? Math.round((r.rating_sum / r.rating_count) * 10) / 10
        : null,
    ratingCount: r.rating_count ?? 0,
    accent: accentFor(r.slug),
    coverUrl: r.cover_url,
    blurb: r.description ?? "",
    deliveryDays: r.delivery_days,
    serviceIncludes: r.service_includes ?? [],
  };
}

const SELECT =
  "id, slug, title, description, kind, category, price_htg, sales_count, rating_count, rating_sum, seller_id, cover_url, delivery_days, service_includes, seller:profiles!products_seller_id_fkey(display_name)";

export type ProductFilters = {
  q?: string;
  category?: string;
  /**
   * Restriction au second niveau de rayon (`lib/taxonomy.ts`). `undefined` =
   * pas de filtre. Une liste VIDE veut dire « rayon sans produit » et doit
   * rendre zéro résultat.
   */
  productIds?: string[];
  /**
   * Filtre par zone (PR-Z2, `docs/33` §4) : produits dont le VENDEUR a
   * déclaré une zone dans le sous-arbre de celle-ci (choisir une komin
   * inclut ses katye). Zone inconnue, désactivée ou sans vendeur → zéro
   * résultat, jamais « pas de filtre ». En mode DÉMO les fixtures n'ont pas
   * de zone : le filtre y rend zéro résultat aussi, pour la même raison.
   */
  zoneId?: string;
};

/** Sentinelle : `in ()` est un rejet côté PostgREST, `in (uuid nul)` non. */
const ZERO_UUID = "00000000-0000-0000-0000-000000000000";

// BL-134 (FRONT-19) : taille de page — « Voir plus » en GET, 0 JS.
export const CATALOGUE_PAGE_SIZE = 24;

export type ProductPage = {
  items: ProductView[];
  hasMore: boolean;
  /**
   * Nombre TOTAL de produits correspondant au filtre — pas celui de la page.
   *
   * ⚠️ L'écran affichait `items.length`, donc « 24 résultats » que le
   * catalogue en compte 24 ou 3 000. Un compteur qui plafonne à la taille de
   * page est faux dès la deuxième page, et c'est le seul chiffre par lequel
   * un acheteur juge si la recherche a trouvé quelque chose.
   */
  total: number;
  /**
   * `false` = le total est un PLANCHER (le COUNT n'a pas répondu). L'écran le
   * préfixe alors « ≥ », comme les sommes d'argent : jamais un nombre nu
   * qu'on sait incomplet.
   */
  totalExact: boolean;
};

/**
 * Le code se déploie tout seul (Vercel, à la fusion) ; les migrations sont
 * appliquées à la main par le porteur. Il existe donc TOUJOURS une fenêtre où
 * le code est en avance sur le schéma. Une requête qui s'appuie sur une colonne
 * pas encore migrée doit se dégrader, pas tomber : un catalogue sans filtre de
 * stock reste un catalogue, un 500 n'est plus rien.
 *
 * `42703` = undefined_column côté Postgres (remonté tel quel par PostgREST).
 */
export function isMissingColumn(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === "42703" || /column .*in_stock.* does not exist/i.test(error.message ?? "");
}

/**
 * Exécute une requête catalogue avec le filtre `in_stock`, et la rejoue sans
 * lui si la colonne n'existe pas encore (migration `0040` non appliquée).
 *
 * Le repli est réservé à CETTE cause. Toute autre erreur (droits, RLS, panne)
 * remonte telle quelle : masquer une panne derrière un catalogue partiel serait
 * pire que l'afficher.
 */
export async function runTolerantOfMissingStock<T>(
  build: (
    withStockFilter: boolean
  ) => PromiseLike<{
    data: T | null;
    error: { code?: string; message?: string } | null;
    /** Compte TOTAL du filtre, quand la requête l'a demandé (`count: exact`). */
    count?: number | null;
  }>
): Promise<{
  data: T | null;
  error: { code?: string; message?: string } | null;
  count?: number | null;
}> {
  const first = await build(true);
  if (!isMissingColumn(first.error)) return first;
  return build(false);
}

function filterSample(
  items: ProductView[],
  filters?: ProductFilters
): ProductView[] {
  let out = items;
  const cat = filters?.category;
  if (cat && cat !== "Tout") {
    out = out.filter((p) => p.category === cat);
  }
  const q = filters?.q?.trim().toLowerCase();
  if (q) {
    out = out.filter((p) =>
      [p.title, p.blurb, p.creator, p.category]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }
  return out;
}

/** Catalogue des produits publiés. Repli sur les données d'exemple si pas de base. */
export async function getPublishedProducts(
  filters?: ProductFilters
): Promise<ProductView[]> {
  if (!isSupabaseConfigured()) return filterSample(demoView(), filters);

  const supabase = await createClient();
  const q = filters?.q?.trim().replace(/[%,()]/g, " ");

  const { data, error } = await runTolerantOfMissingStock<Row[]>((withStockFilter) => {
    let query = supabase.from("products").select(SELECT).eq("status", "published");
    // Spec §9 : un produit en rupture n'apparaît pas dans les résultats — un
    // catalogue fantôme détruit la confiance plus vite qu'une offre courte.
    // Sa FICHE reste accessible (lien WhatsApp partagé) et affiche la rupture.
    // Les produits digitaux ont in_stock = true à vie (0040).
    if (withStockFilter) query = query.eq("in_stock", true);

    if (filters?.category && filters.category !== "Tout") {
      query = query.eq("category", filters.category);
    }
    if (q) {
      query = query.or(`title.ilike.%${q}%,description.ilike.%${q}%`);
    }

    // BL-116 (C-6, pattern Amazon — liste toujours bornée) : sans LIMIT, le HTML
    // du catalogue croissait linéairement avec l'offre (3G). 60 = ~2 écrans.
    return query.order("created_at", { ascending: false }).limit(60) as unknown as PromiseLike<{
      data: Row[] | null;
      error: { code?: string; message?: string } | null;
    }>;
  });

  if (error || !data) {
    // BL-116 : le repli « produits de démo » est réservé au mode NON configuré
    // (géré plus haut). En prod, masquer une panne derrière des produits
    // inachetables détruirait la confiance → on remonte l'erreur.
    throw new Error(`catalogue indisponible: ${error?.message ?? "réponse vide"}`);
  }
  return (data as unknown as Row[]).map((r) => {
    const v = rowAsView(r);
    // Blurb tronqué SERVEUR : la description intégrale n'a rien à faire dans
    // une carte de liste (poids page).
    return { ...v, blurb: v.blurb.length > 160 ? v.blurb.slice(0, 157) + "…" : v.blurb };
  });
}

/**
 * Catalogue paginé (BL-134) — utilisé par /catalogue. Un cran de plus que
 * getPublishedProducts (page d'accueil, non paginée, cap fixe à 60) :
 * pagination réelle + recherche qui couvre aussi le nom du créateur (un
 * acheteur qui a suivi un talent sur WhatsApp tape son nom, pas un titre).
 */
/**
 * Catégories RÉELLEMENT présentes au catalogue.
 *
 * Remplace la liste en dur pour la NAVIGATION (les puces d'accueil et de
 * catalogue). Raison : `lib/product-categories.ts` ne connaît que les six
 * libellés digitaux historiques, alors qu'un produit physique enregistre le
 * libellé de son DÉPARTEMENT (« Auto & Moto », `api/products/physical` §142).
 * Aucune puce ne pouvait donc l'atteindre — il n'était visible que sous
 * « Tout », et disparaissait dès qu'on filtrait.
 *
 * Dérivée des données, elle règle aussi la réserve de V-13 : elle n'affiche
 * jamais une catégorie vide, puisqu'une catégorie n'existe que si un produit
 * publié s'y trouve. À catalogue vide, elle rend une liste vide et l'appelant
 * n'affiche aucune barre — plutôt que seize rayons déserts.
 *
 * ⚠️ La liste en dur reste la source unique pour la PUBLICATION d'un produit
 * digital (BL-105, taxonomie fermée) : on ne dérive pas ce qu'un vendeur peut
 * choisir de ce qui existe déjà, sinon la première faute d'orthographe
 * devient une catégorie.
 */
export async function getCatalogueCategories(): Promise<string[]> {
  if (!isSupabaseConfigured()) {
    return [...new Set(demoView().map((p) => p.category).filter(Boolean))].sort();
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .select("category")
    .eq("status", "published")
    .not("category", "is", null)
    // Borne : la barre n'a pas vocation à refléter un catalogue immense, et
    // une requête non bornée sur une page servie à chaque visite se paie.
    .limit(2000);

  if (error || !data) {
    // Dégrader, jamais casser : sans barre, le catalogue reste consultable.
    console.error("[catalogue] catégories indisponibles", error?.message ?? "réponse vide");
    return [];
  }
  const uniques = [
    ...new Set((data as { category: string | null }[]).map((r) => r.category ?? "")),
  ].filter((c) => c.length > 0);
  return uniques.sort((a, b) => a.localeCompare(b, "fr"));
}

/**
 * Couche 2 — rattrapage par similarité, appelé UNIQUEMENT quand la recherche
 * littérale ne rend rien.
 *
 * `ilike '%batri%'` exige la sous-chaîne exacte : « batery » ne trouve jamais
 * « Batri ». C'est le cas courant d'un Kreyòl écrit à l'oreille, et c'est ce
 * que la similarité trigramme rattrape (`zabelie_search_fuzzy`, 0047).
 *
 * Rend une liste VIDE si la fonction n'existe pas encore en base : le
 * catalogue continue de servir la couche 1, personne ne voit d'erreur.
 */
export async function searchFuzzyProductIds(q: string): Promise<string[]> {
  if (!isSupabaseConfigured() || q.trim().length < 3) return [];
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("zabelie_search_fuzzy", {
    p_raw: q,
    p_limit: 24,
  });
  if (error || !data) {
    console.warn("[recherche] rattrapage indisponible", error?.message ?? "réponse vide");
    return [];
  }
  return (data as { product_id: string }[]).map((r) => r.product_id);
}

/**
 * Consigne une recherche restée sans résultat. Best-effort, TOUJOURS : un
 * capteur qui ferait échouer la page qu'il observe serait un mauvais échange.
 * Journalisé en cas d'échec — l'absence de signal doit rester un signal.
 */
export async function recordSearchMiss(input: {
  q: string;
  department: string | null;
  sessionHash: string;
}): Promise<void> {
  if (!isSupabaseConfigured()) return;
  try {
    const admin = createAdminClient();
    const { error } = await admin.rpc("zabelie_record_search_miss", {
      p_raw: input.q,
      p_department: input.department,
      p_session_hash: input.sessionHash,
    });
    if (error) console.warn("[recherche] manque non consigné", error.message);
  } catch (e) {
    console.warn("[recherche] manque non consigné", e instanceof Error ? e.message : e);
  }
}

export async function getPublishedProductsPage(
  filters: ProductFilters & { page?: number }
): Promise<ProductPage> {
  const page = Math.max(1, filters.page ?? 1);
  const offset = (page - 1) * CATALOGUE_PAGE_SIZE;

  if (!isSupabaseConfigured()) {
    // Les fixtures démo n'ont pas de zone : un filtre zone y rend ZÉRO
    // résultat — afficher tout le catalogue sous un filtre qui n'a pas pris
    // est exactement le défaut que la règle `productIds` ci-dessus interdit.
    const all = filters.zoneId ? [] : filterSample(demoView(), filters);
    return {
      items: all.slice(offset, offset + CATALOGUE_PAGE_SIZE),
      hasMore: offset + CATALOGUE_PAGE_SIZE < all.length,
      total: all.length,
      totalExact: true,
    };
  }

  const supabase = await createClient();

  // PR-Z2 (docs/33 §4) : le sous-arbre de la zone est résolu UNE fois, hors
  // de la requête catalogue — même règle que la recherche par nom de
  // créateur (BL-134) : un rejeu du filtre de stock ne relance pas la
  // lecture des zones.
  let zoneSellerIds: string[] | null = null;
  if (filters.zoneId) {
    zoneSellerIds = await getSellerIdsInZone(filters.zoneId);
  }

  const q = filters.q?.trim().replace(/[%,()]/g, " ");
  // BL-134 (C-7b) : la recherche couvre aussi le nom du créateur. Résolu une
  // seule fois, hors de la requête catalogue — un éventuel rejeu du filtre de
  // stock ne doit pas relancer cette lecture.
  let sellerIds: string[] = [];
  if (q) {
    const { data: matchingSellers } = await supabase
      .from("profiles")
      .select("id")
      .ilike("display_name", `%${q}%`)
      .limit(50);
    sellerIds = (matchingSellers ?? []).map((s) => s.id);
  }

  const { data, error, count } = await runTolerantOfMissingStock<Row[]>((withStockFilter) => {
    // `count: exact` : le TOTAL du filtre, dans la MÊME requête que la page —
    // pas de second aller-retour. Il porte exactement les mêmes filtres que
    // les lignes rendues, par construction : c'est la même requête.
    let query = supabase
      .from("products")
      .select(SELECT, { count: "exact" })
      .eq("status", "published");
    // Spec §9 : un produit en rupture n'apparaît pas dans les résultats — un
    // catalogue fantôme détruit la confiance plus vite qu'une offre courte.
    // Sa FICHE reste accessible (lien WhatsApp partagé) et affiche la rupture.
    // Les produits digitaux ont in_stock = true à vie (0040).
    if (withStockFilter) query = query.eq("in_stock", true);

    if (filters.category && filters.category !== "Tout") {
      query = query.eq("category", filters.category);
    }

    // Second niveau de rayon (catégorie fine). `null` = pas de restriction —
    // la liste vide, elle, veut dire « aucun produit dans ce rayon » et doit
    // rendre zéro résultat : confondre les deux afficherait le catalogue
    // entier sous un rayon vide, sans jamais dire que le filtre n'a pas pris.
    if (filters.productIds) {
      query = query.in("id", filters.productIds.length > 0 ? filters.productIds : [ZERO_UUID]);
    }

    // Zone : mêmes règles que `productIds` — une zone sans vendeur (ou
    // inconnue, ou désactivée) filtre sur la sentinelle et rend zéro
    // résultat, jamais le catalogue entier.
    if (zoneSellerIds) {
      query = query.in("seller_id", zoneSellerIds.length > 0 ? zoneSellerIds : [ZERO_UUID]);
    }

    if (q) {
      const clauses = [`title.ilike.%${q}%`, `description.ilike.%${q}%`];
      if (sellerIds.length > 0) clauses.push(`seller_id.in.(${sellerIds.join(",")})`);
      query = query.or(clauses.join(","));
    }

    // Une ligne de plus que la page demandée : sait s'il y a une suite sans
    // requête COUNT séparée (range() est inclusif aux deux bornes).
    return query
      .order("created_at", { ascending: false })
      .range(offset, offset + CATALOGUE_PAGE_SIZE) as unknown as PromiseLike<{
      data: Row[] | null;
      error: { code?: string; message?: string } | null;
      count: number | null;
    }>;
  });

  if (error || !data) {
    throw new Error(`catalogue indisponible: ${error?.message ?? "réponse vide"}`);
  }
  const rows = data as unknown as Row[];
  const hasMore = rows.length > CATALOGUE_PAGE_SIZE;
  const items = rows.slice(0, CATALOGUE_PAGE_SIZE).map((r) => {
    const v = rowAsView(r);
    return { ...v, blurb: v.blurb.length > 160 ? v.blurb.slice(0, 157) + "…" : v.blurb };
  });
  /* Repli qui SOUS-ESTIME : sans COUNT, on rend ce qu'on a effectivement vu
   * (les pages précédentes + celle-ci) et on le marque inexact. Un repli sur
   * `items.length` serait le bug d'origine avec un autre nom. */
  return {
    items,
    hasMore,
    total: count ?? offset + items.length,
    totalExact: count != null,
  };
}

export async function getProductView(
  slug: string
): Promise<ProductView | undefined> {
  if (!isSupabaseConfigured()) {
    return demoView().find((p) => p.slug === slug);
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .select(SELECT)
    .eq("slug", slug)
    .eq("status", "published")
    .single();

  // Base configurée : un slug introuvable est un 404, JAMAIS une fixture.
  // L'ancien repli rendait un produit de démo en PRODUCTION dès que le
  // slug coïncidait — un produit inventé, présenté comme achetable.
  if (error || !data) return undefined;
  return rowAsView(data as unknown as Row);
}

/** Produits publiés d'un vendeur (pour la page profil créateur). */
export async function getProductsBySeller(
  sellerId: string
): Promise<ProductView[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .select(SELECT)
    .eq("seller_id", sellerId)
    .eq("status", "published")
    .order("created_at", { ascending: false });

  if (error || !data) return [];
  return (data as unknown as Row[]).map(rowAsView);
}

/**
 * Toutes les fiches publiées, RUPTURE COMPRISE — réservé au sitemap.
 * Une fiche en rupture reste une URL valide qui répond 200 : la retirer du
 * sitemap puis l'y remettre au réapprovisionnement ferait battre le fichier et
 * gaspillerait le référencement accumulé. Le catalogue, lui, l'exclut bien.
 */
export async function getProductsForSitemap(): Promise<ProductView[]> {
  if (!isSupabaseConfigured()) return demoView();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .select(SELECT)
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .limit(5000);

  if (error || !data) return [];
  return (data as unknown as Row[]).map(rowAsView);
}
