import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/products";
import type { Lang } from "@/lib/i18n";

/**
 * Navigation par rayon — les 74 catégories de `0035`, enfin lisibles.
 *
 * Elles existaient en base depuis des semaines sans qu'AUCUNE page ne les
 * lise : la seule lecture de `zabelie_categories` était le formulaire de
 * création. 123 rayons saisis, zéro rayon visité.
 *
 * DEUX NIVEAUX, DEUX COLONNES DIFFÉRENTES — c'est le piège de ce chantier :
 *   - le DÉPARTEMENT est écrit en clair dans `products.category`
 *     (« Auto & Moto », `api/products/physical:262`) : les puces dérivées du
 *     catalogue le filtrent déjà ;
 *   - la CATÉGORIE fine vit dans `zabelie_physical_products.category_id`
 *     (`0036:29`), donc uniquement pour les produits physiques.
 * Un produit digital n'a pas de catégorie fine, et n'en aura pas : sa
 * taxonomie est la liste fermée de `lib/product-categories.ts`.
 *
 * V-13 : on n'affiche JAMAIS un rayon vide. Une catégorie n'apparaît que si
 * un produit publié s'y trouve — sinon on remplacerait six libellés faux par
 * soixante-quatorze rayons déserts, ce que la décision interdit nommément.
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
  level: number;
  parent_id: string | null;
};

function labelFor(row: CategoryRow, lang: Lang): string {
  // Kreyòl-first : le libellé créole existe en base pour chaque rayon.
  return lang === "ht" ? row.label_kr || row.label_fr : row.label_fr;
}

/**
 * Catégories NON VIDES du département donné (son libellé, tel qu'écrit dans
 * `products.category`). Rend une liste vide plutôt qu'une erreur : sans
 * second niveau, le catalogue reste consultable au niveau département.
 */
export async function getCategoryFacets(
  departmentLabel: string,
  lang: Lang
): Promise<Facette[]> {
  if (!isSupabaseConfigured() || !departmentLabel) return [];

  const supabase = await createClient();

  // Produits physiques PUBLIÉS et leur catégorie fine. Le filtre sur le
  // statut est porté par la jointure : un brouillon ne doit pas peupler un
  // rayon visible, sinon la barre annonce une offre qui n'existe pas encore.
  const { data: liens, error } = await supabase
    .from("zabelie_physical_products")
    .select("category_id, products!inner(status, category)")
    .eq("products.status", "published")
    .eq("products.category", departmentLabel)
    .limit(2000);

  if (error || !liens) {
    // Schéma en retard (`0036` non appliquée) ou incident : on dégrade vers
    // « pas de second niveau », jamais vers une page en erreur.
    console.error("[taxonomie] facettes indisponibles", error?.message ?? "réponse vide");
    return [];
  }

  const { data: cats } = await supabase
    .from("zabelie_categories")
    .select("id, slug, label_fr, label_kr, level, parent_id")
    .in("id", [...new Set((liens as unknown as { category_id: string }[]).map((l) => l.category_id))]);

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

  const { data: liens, error } = await supabase
    .from("zabelie_physical_products")
    .select("product_id")
    .in("category_id", ids)
    .limit(2000);

  if (error || !liens) return null;
  return (liens as unknown as { product_id: string }[]).map((l) => l.product_id);
}
