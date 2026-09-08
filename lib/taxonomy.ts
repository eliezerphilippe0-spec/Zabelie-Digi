import type { ProductKind } from "@/lib/product-kind";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { isMissingColumn } from "@/lib/products";
import { isSupabaseConfigured } from "@/lib/products";
import type { Lang } from "@/lib/i18n";
import { KIND_PHYSICAL } from "@/lib/product-kind";

/**
 * Taxonomie commune aux produits physiques, fichiers et services.
 * `products.category` porte le libellé français du département ; depuis
 * 0098, `products.category_id` porte le niveau 2 ou 3 pour tous les types.
 * Les facettes commerciales suivent les offres publiées. Le répertoire
 * /categories montre aussi les catégories actives encore sans offres,
 * avec un état vide explicite. Les catégories inactives restent exclues
 * par la politique RLS de la base.
 */

export type Facette = {
  slug: string;
  label: string;
  /** Nombre de produits publiés dans ce rayon (descendants compris). */
  count: number;
};

type CategoryRow = {
  id: string;
  slug: string;
  label_fr: string;
  label_kr: string;
  label_en: string;
  /** `null` tant que 0052 n'est pas appliquée — le repli est explicite. */
  label_es: string | null;
  level: number;
  parent_id: string | null;
};

/**
 * Libellé d'un rayon dans la langue courante.
 *
 * Les libellés de catégories ne vivent PAS dans `lib/i18n.ts` : ils sont en
 * base, une colonne par langue (`0035_categories.sql`). L'anglais y était déjà
 * — `label_en not null` depuis la création de la table, peuplé pour les 123
 * lignes. Seul le `select` ne le demandait pas et le type ne le déclarait pas :
 * l'ajout de la troisième langue n'a donc coûté aucune migration ici.
 *
 * `|| label_fr` sur chaque branche : la colonne est `not null` mais rien
 * n'interdit une chaîne vide, et un rayon sans nom est pire qu'un rayon nommé
 * dans la mauvaise langue.
 */
function labelFor(row: CategoryRow, lang: Lang): string {
  switch (lang) {
    case "ht":
      return row.label_kr || row.label_fr;
    case "en":
      return row.label_en || row.label_fr;
    // `label_es` arrive avec `0052`. Le repli sur le français reste en place
    // pour DEUX cas distincts : la migration pas encore appliquée, et une
    // catégorie créée plus tard sans traduction. La colonne est volontairement
    // nullable — obliger toute catégorie future à naître traduite bloquerait
    // une migration produit sur une question de vocabulaire.
    case "es":
      return row.label_es || row.label_fr;
    case "fr":
      return row.label_fr;
  }
}

/**
 * Catégories NON VIDES du département donné (son libellé, tel qu'écrit dans
 * `products.category`). Rend une liste vide plutôt qu'une erreur : sans
 * second niveau, le catalogue reste consultable au niveau département.
 */
export async function getCategoryFacets(
  departmentLabel: string,
  lang: Lang,
  kind?: ProductKind
): Promise<Facette[]> {
  if (!isSupabaseConfigured() || !departmentLabel) return [];

  const supabase = await createClient();

  // Produits PUBLIÉS du département et leur sous-rayon. Depuis 0098 la
  // catégorie fine vit sur `products.category_id` pour TOUT type — le physique
  // y est recopié (backfill 0098 + écriture à la création), le digital et le
  // service la reçoivent du formulaire. Un brouillon ne peuple pas un rayon
  // visible : la barre annoncerait une offre qui n'existe pas encore.
  let productsQuery = supabase
    .from("products")
    .select("category_id")
    .eq("status", "published")
    .eq("category", departmentLabel)
    .not("category_id", "is", null)
    .limit(2000);
  if (kind) productsQuery = productsQuery.eq("kind", kind);
  const { data: liens, error } = await productsQuery;

  if (error || !liens) {
    // Schéma en retard (`0036` non appliquée) ou incident : on dégrade vers
    // « pas de second niveau », jamais vers une page en erreur.
    console.error("[taxonomie] facettes indisponibles", error?.message ?? "réponse vide");
    return [];
  }

  const { data: cats } = await lireCategories(
    supabase,
    "id, slug, label_fr, label_kr, label_en, label_es, level, parent_id",
    (q) => q.in("id", [...new Set((liens as unknown as { category_id: string }[]).map((l) => l.category_id))])
  );

  return agregerFacettes(
    liens as unknown as { category_id: string }[],
    (cats ?? []) as unknown as CategoryRow[],
    lang
  );
}

/**
 * Cœur de l'agrégation, PUR et exporté pour être éprouvé sans base.
 *
 * Sans Supabase en local, tout le chemin ci-dessus rend une liste vide : la
 * seule façon d'éprouver la règle de regroupement est de la sortir de la
 * requête. C'est aussi là que se logeraient les vraies fautes — un niveau 3
 * compté deux fois, un parent manquant qui fait disparaître un rayon.
 */
export function agregerFacettes(
  liens: { category_id: string }[],
  cats: CategoryRow[],
  lang: Lang
): Facette[] {
  const counts = new Map<string, number>();
  for (const l of liens) {
    counts.set(l.category_id, (counts.get(l.category_id) ?? 0) + 1);
  }

  const parIdent = new Map(cats.map((r) => [r.id, r]));
  const agrege = new Map<string, { row: CategoryRow; count: number }>();

  for (const r of cats) {
    const n = counts.get(r.id) ?? 0;
    if (n === 0) continue;
    // Les fiches sont rangées au niveau 2 OU 3. On remonte les niveaux 3 sur
    // leur parent : une barre à deux niveaux se lit sur un téléphone, une
    // barre à trois ne se lit plus. Parent absent du lot (il n'a lui-même
    // aucun produit) → on garde l'enfant plutôt que de perdre le rayon.
    const cible = r.level === 3 && r.parent_id ? parIdent.get(r.parent_id) ?? r : r;
    const deja = agrege.get(cible.id);
    agrege.set(cible.id, { row: cible, count: (deja?.count ?? 0) + n });
  }

  return [...agrege.values()]
    .map(({ row, count }) => ({ slug: row.slug, label: labelFor(row, lang), count }))
    .sort((a, b) => a.label.localeCompare(b.label, "fr"));
}

/**
 * Identifiants des produits d'une catégorie (elle-même et ses descendants).
 * `null` = pas de restriction applicable (slug inconnu, schéma en retard) —
 * l'appelant ne filtre alors pas, plutôt que de rendre zéro résultat sans
 * expliquer pourquoi.
 */
export async function productIdsInCategory(slug: string): Promise<string[] | null> {
  if (!isSupabaseConfigured() || !slug) return null;
  const supabase = await createClient();

  const { data: cat } = await supabase
    .from("zabelie_categories")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (!cat) return null;

  const parent = (cat as { id: string }).id;
  const { data: enfants } = await supabase
    .from("zabelie_categories")
    .select("id")
    .eq("parent_id", parent);

  const ids = [parent, ...((enfants ?? []) as { id: string }[]).map((e) => e.id)];

  // 0098 : la sous-catégorie est sur `products` pour tout type — un service
  // rangé dans « Recharge Digicel » se filtre comme une pièce auto.
  const { data: liens, error } = await supabase
    .from("products")
    .select("id")
    .in("category_id", ids)
    .limit(2000);

  if (error || !liens) return null;
  return (liens as unknown as { id: string }[]).map((l) => l.id);
}

// ════════════ Menu déroulant des rayons (capture porteur, 2026-08-02) ═══════

/** Un rayon dans le menu : son libellé, s'il est désert, et ses sous-rayons. */
export type RayonMenu = {
  slug: string;
  label: string;
  /**
   * Lien de catalogue CORRECT pour ce rayon — calculé ici, une fois, parce
   * que le calcul est piégeux et qu'il a déjà été raté : le menu liait
   * `?cat=<slug>` alors que la page catalogue filtre `products.category`,
   * qui stocke le `label_fr` du DÉPARTEMENT (`api/products/physical` §160).
   * Un clic sur un rayon peuplé rendait toujours zéro résultat — invisible
   * tant qu'aucun produit physique n'est publié (B2), c'est-à-dire un lien
   * sans trafic, la variante navigation du code sans appelant.
   *   - niveau 1 → `/catalogue?cat=<label_fr du département>`
   *   - niveau 2+ → `/catalogue?cat=<label_fr du département>&sous=<slug>`
   *     (`sous` est résolu par `productIdsInCategory`, qui parle en slugs)
   */
  href: string;
  /** Aucun produit publié dans ce rayon NI dans ses descendants. */
  vide: boolean;
  enfants: RayonMenu[];
};

/**
 * Construction du menu, PURE et exportée pour être éprouvée sans base.
 *
 * DÉCISION PORTEUR (2026-08-02) : on affiche TOUS les rayons actifs, y compris
 * ceux sans produit, mais on les MARQUE. C'est un compromis assumé avec V-13
 * (« aucun rayon désert ») : V-13 interdisait d'afficher une rangée vide sur
 * l'accueil comme si elle contenait quelque chose. Ici l'étendue prévue du
 * catalogue est une information utile — à condition que l'acheteur voie du
 * premier coup d'œil où il y a de la marchandise et où il n'y en a pas encore.
 * Un rayon marqué vide ne doit pas être cliquable : une impasse signalée reste
 * une impasse si on peut y entrer.
 *
 * REMONTÉE DES COMPTES : un rayon de niveau 1 n'est vide que si LUI et tous
 * ses descendants le sont. Sans cette remontée, un département dont toute la
 * marchandise est rangée au niveau 2 s'afficherait grisé alors qu'il est plein
 * — l'erreur exacte que `agregerFacettes` évite déjà pour la barre de facettes.
 */
export function construireMenu(
  cats: (CategoryRow & { active: boolean; position: number })[],
  comptes: Map<string, number>,
  lang: Lang
): RayonMenu[] {
  const actifs = cats.filter((c) => c.active);

  /** Compte propre + descendants, quel que soit le nombre de niveaux. */
  const total = (id: string): number => {
    let n = comptes.get(id) ?? 0;
    for (const c of actifs) {
      if (c.parent_id === id) n += total(c.id);
    }
    return n;
  };

  const noeud = (c: (typeof actifs)[number], departementFr: string): RayonMenu => ({
    slug: c.slug,
    label: labelFor(c, lang),
    href:
      c.level === 1
        ? `/catalogue?cat=${encodeURIComponent(departementFr)}`
        : `/catalogue?cat=${encodeURIComponent(departementFr)}&sous=${encodeURIComponent(c.slug)}`,
    vide: total(c.id) === 0,
    enfants: actifs
      .filter((e) => e.parent_id === c.id)
      .sort((a, b) => a.position - b.position)
      // Le département de rattachement se PROPAGE : chaque descendant filtre
      // d'abord par son département (label_fr), puis par son propre slug.
      .map((e) => noeud(e, departementFr)),
  });

  return actifs
    // Un rayon de niveau 1 n'a pas de parent ; un niveau 2 dont le parent est
    // INACTIF ne doit pas remonter à la racine du menu — il apparaîtrait comme
    // un département, ce qu'il n'est pas.
    .filter((c) => c.level === 1 && c.parent_id === null)
    .sort((a, b) => a.position - b.position)
    .map((c) => noeud(c, c.label_fr));
}

/**
 * Le menu, depuis la base. Rend `[]` plutôt qu'une erreur : un en-tête sans
 * menu reste utilisable, un en-tête qui plante ne l'est pas.
 *
 * `cache()` (React) : mémoïsé PAR REQUÊTE — en-tête, sidebar, grille d'accueil
 * et pied de page partagent une seule lecture de `zabelie_categories` au lieu
 * de quatre. Pas de cache inter-requêtes : la lecture anon est bornée et un
 * cache profilé sur un client à cookies est un piège classique.
 */
export const getMenuRayons = cache(getMenuRayonsNonMemoise);


/**
 * Lit `zabelie_categories` en tolérant l'absence de `label_es` (`0052` non
 * appliquée — c'est l'état MESURÉ de la production au 2026-08-10).
 *
 * Sans ce repli, la requête échoue en 42703, le menu revient vide, et la
 * colonne des rayons comme la grille des catégories DISPARAISSENT de
 * l'accueil — c'est exactement ce qui s'est produit : les 16 rayons activés
 * en base ne se sont jamais affichés. Même règle que `lib/products.ts` pour
 * `in_stock` : le code devance le schéma, une requête se dégrade, elle ne
 * tombe pas. Le repli espagnol → français est déjà dans `libelle()`.
 */
export async function lireCategories(
  supabase: Awaited<ReturnType<typeof createClient>>,
  colonnes: string,
  filtre: (q: ReturnType<ReturnType<Awaited<ReturnType<typeof createClient>>["from"]>["select"]>) => unknown
): Promise<{ data: unknown[] | null; error: { code?: string; message?: string } | null }> {
  const requete = (cols: string) =>
    filtre(supabase.from("zabelie_categories").select(cols)) as PromiseLike<{
      data: unknown[] | null;
      error: { code?: string; message?: string } | null;
    }>;
  const premier = await requete(colonnes);
  if (!isMissingColumn(premier.error)) return premier;
  const second = await requete(colonnes.replace(/,\s*label_es/, ""));
  return {
    data: (second.data ?? [])?.map((r) => ({ ...(r as object), label_es: null })),
    error: second.error,
  };
}

async function getMenuRayonsNonMemoise(lang: Lang): Promise<RayonMenu[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createClient();

  const { data: cats, error } = await lireCategories(
    supabase,
    "id, slug, label_fr, label_kr, label_en, label_es, level, parent_id, active, position",
    (q) => q.eq("active", true)
  );

  if (error || !cats) {
    // L'absence de signal doit être un signal : sans cette ligne, « le menu
    // est vide » et « la requête a échoué » produisent le même écran.
    console.error("[taxonomie] menu indisponible", error?.message ?? "réponse vide");
    return [];
  }

  // Comptes par sous-rayon, produits PUBLIÉS seulement, tout type (0098 :
  // `products.category_id`, backfillé depuis le physique). Un brouillon ne
  // doit pas décompter un rayon comme peuplé.
  const { data: liens } = await supabase
    .from("products")
    .select("category_id")
    .eq("status", "published")
    .not("category_id", "is", null)
    .limit(5000);

  const comptes = new Map<string, number>();
  for (const l of (liens ?? []) as unknown as { category_id: string }[]) {
    comptes.set(l.category_id, (comptes.get(l.category_id) ?? 0) + 1);
  }

  /* PRODUITS SANS SOUS-RAYON — le repli par libellé (correctif 2026-08-11,
   * conservé après 0098).
   *
   * Un fichier ou un service publié AVANT 0098, ou publié au seul niveau du
   * département, n'a pas de `category_id` : son rattachement est le libellé
   * français du rayon, porté par `products.category`. Sans ce repli, les
   * trois services publiés en production disparaîtraient du compte et le
   * badge « bientôt » redeviendrait indélébile — le défaut mesuré en août.
   *
   * L'exclusion du type PHYSIQUE reste indispensable : un physique a toujours
   * un `category_id` (colonne `not null` sur son extension, recopiée), donc
   * il est déjà compté ci-dessus ; le compter par libellé le compterait deux
   * fois. Et on ne prend que les produits SANS `category_id`, pour la même
   * raison. */
  const { data: nonPhysiques } = await supabase
    .from("products")
    .select("category")
    .eq("status", "published")
    .neq("kind", KIND_PHYSICAL)
    .is("category_id", null)
    .not("category", "is", null)
    .limit(5000);

  const idParLabelFr = new Map(
    (cats as unknown as CategoryRow[]).map((c) => [c.label_fr, c.id])
  );
  for (const p of (nonPhysiques ?? []) as unknown as { category: string }[]) {
    const id = idParLabelFr.get(p.category);
    // Libellé orphelin (taxonomie d'avant l'unification) : on l'ignore, mais
    // on le DIT — sinon un produit invisible dans la navigation reste un
    // mystère silencieux.
    if (!id) {
      console.log(
        "[taxonomie]",
        JSON.stringify({ issue: "categorie_orpheline", valeur: p.category })
      );
      continue;
    }
    comptes.set(id, (comptes.get(id) ?? 0) + 1);
  }

  return construireMenu(
    cats as unknown as (CategoryRow & { active: boolean; position: number })[],
    comptes,
    lang
  );
}
