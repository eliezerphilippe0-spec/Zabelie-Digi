import type { SupabaseClient } from "@supabase/supabase-js";
import { lireCategories } from "./taxonomy";
import type { Lang } from "./i18n";

/**
 * TAXONOMIE DE PUBLICATION — une seule, celle de la base.
 *
 * ─── LE DÉFAUT CORRIGÉ (2026-08-11) ─────────────────────────────────────────
 * Ce fichier portait SIX libellés en dur — « Photo », « Business », « Musique »,
 * « Design », « Carrière », « Marketing » — dans lesquels le vendeur publiait,
 * pendant que TOUTE la navigation (menu, colonne des rayons, grille d'accueil,
 * catalogue) lisait l'arbre `zabelie_categories`, ses seize rayons et leurs
 * enfants. Deux vocabulaires parallèles qui ne se croisaient jamais.
 *
 * Conséquence mesurée en production : un service publié dans « Marketing » et
 * un fichier publié dans « Carrière » n'appartenaient à aucun rayon connu de
 * la navigation, et le badge « bientôt » ne pouvait PAS s'éteindre — quel que
 * soit le nombre de produits publiés. Le porteur l'a vu comme un défaut de
 * rafraîchissement ; c'était une taxonomie orpheline.
 *
 * ─── CE QUE LA VALEUR STOCKÉE DOIT ÊTRE ─────────────────────────────────────
 * `products.category` est comparé PAR ÉGALITÉ STRICTE au libellé FRANÇAIS du
 * département : `getCategoryFacets` fait `eq("products.category", label)`, et
 * les liens du menu portent `?cat=<label_fr>`. La liste ci-dessous rend donc
 * `value = label_fr` (la clé de jointure, invariante par langue) et
 * `label = le libellé traduit` (ce que le vendeur lit). Confondre les deux
 * rendrait les produits d'un vendeur kreyòl introuvables au filtre.
 *
 * ⚠️ Reste à faire, et c'est nommé : le vendeur ne choisit ici qu'un RAYON
 * (niveau 1). Les sous-catégories fines existent pour le physique
 * (`zabelie_physical_products.category_id`) mais pas pour le digital ni le
 * service — il leur manque une colonne. Tant qu'elle n'existe pas, les douze
 * feuilles de services de `0057` enrichissent la navigation, pas le
 * formulaire.
 */

export type OptionCategorie = {
  /** Ce qui part en base — `label_fr`, la clé de jointure du catalogue. */
  value: string;
  /** Ce que le vendeur lit, dans SA langue. */
  label: string;
};

/**
 * Les rayons ouverts, tels que la navigation les connaît.
 *
 * Rend une liste VIDE plutôt qu'une erreur si la base est injoignable : le
 * formulaire affiche alors son message « aucune catégorie », et le vendeur
 * comprend qu'il manque quelque chose — au lieu d'une page en erreur. Même
 * dégradation que le reste du module taxonomie.
 */
export async function lireRayonsPublication(
  client: SupabaseClient,
  lang: Lang
): Promise<OptionCategorie[]> {
  const { data, error } = await lireCategories(
    client,
    "slug, label_fr, label_kr, label_en, label_es, level, position",
    (q) => q.eq("active", true).eq("level", 1)
  );
  if (error || !data) {
    console.error(
      "[categories] rayons de publication indisponibles",
      error?.message ?? "réponse vide"
    );
    return [];
  }
  type Row = {
    label_fr: string;
    label_kr: string | null;
    label_en: string | null;
    label_es: string | null;
    position: number | null;
  };
  return (data as unknown as Row[])
    .filter((r) => r.label_fr)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map((r) => ({
      value: r.label_fr,
      label:
        (lang === "ht" ? r.label_kr : lang === "en" ? r.label_en : lang === "es" ? r.label_es : null) ||
        r.label_fr,
    }));
}

/**
 * Liste blanche SERVEUR — la base fait foi, jamais le corps de la requête.
 *
 * Rend le libellé canonique, ou `null` si la valeur n'est pas un rayon actif.
 * Asynchrone à dessein : une liste en dur ne peut pas suivre une taxonomie
 * qui vit en base, et c'est exactement ce qui a créé le défaut ci-dessus.
 */
export async function normalizeCategory(
  client: SupabaseClient,
  input: unknown
): Promise<string | null> {
  if (typeof input !== "string") return null;
  const v = input.trim();
  if (!v) return null;
  const { data, error } = await lireCategories(
    client,
    "label_fr, level, active",
    (q) => q.eq("active", true).eq("level", 1).eq("label_fr", v)
  );
  if (error) {
    console.error("[categories] validation impossible", error.message);
    return null;
  }
  return (data as unknown as { label_fr: string }[] | null)?.[0]?.label_fr ?? null;
}
