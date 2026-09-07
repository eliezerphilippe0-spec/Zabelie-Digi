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
 * Depuis 0098, les fichiers et services peuvent aussi choisir un niveau
 * 2 ou 3 via `lireSousRayonsPublication`. L'identifiant est validé côté
 * serveur contre le département actif avant écriture.
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

// ════════════════════════════════════════════════════════════════════════════
// SOUS-RAYONS — le second niveau du formulaire, pour TOUT type de produit (0098)
// ════════════════════════════════════════════════════════════════════════════

/**
 * Un sous-rayon proposable à la publication : niveau 2 ou 3, actif, rattaché
 * à un département dont on connaît le `label_fr` (la clé que le formulaire
 * envoie déjà). Le libellé est déjà dans la langue du vendeur ; `chemin`
 * porte « Parent › Enfant » pour qu'une feuille de niveau 3 se lise sans
 * connaître l'arbre.
 */
export type OptionSousRayon = {
  id: string;
  /** `label_fr` du département (niveau 1) — la même clé que `OptionCategorie.value`. */
  departement: string;
  /** Libellé traduit, avec son parent pour un niveau 3. */
  chemin: string;
  level: 2 | 3;
};

type LigneSousRayon = {
  id: string;
  parent_id: string | null;
  level: number;
  position: number | null;
  label_fr: string;
  label_kr: string | null;
  label_en: string | null;
  label_es: string | null;
};

function libelle(r: LigneSousRayon, lang: Lang): string {
  return (
    (lang === "ht" ? r.label_kr : lang === "en" ? r.label_en : lang === "es" ? r.label_es : null) ||
    r.label_fr
  );
}

/**
 * Tous les sous-rayons ACTIFS, groupables par département, dans la langue du
 * vendeur. Pure après la lecture : `construireSousRayons` est exporté pour
 * être éprouvé sans base.
 *
 * Pourquoi maintenant : jusqu'à 0098, le vendeur digital ne choisissait qu'un
 * département. Les feuilles de service (0057) et de recharge (0097) existaient
 * en base sans qu'aucune fiche puisse s'y ranger — une taxonomie que le
 * catalogue affichait et que la publication ignorait.
 */
export async function lireSousRayonsPublication(
  client: SupabaseClient,
  lang: Lang
): Promise<OptionSousRayon[]> {
  const { data, error } = await lireCategories(
    client,
    "id, parent_id, level, position, label_fr, label_kr, label_en, label_es",
    (q) => q.eq("active", true)
  );
  if (error || !data) {
    console.error("[categories] sous-rayons indisponibles", error?.message ?? "réponse vide");
    return [];
  }
  return construireSousRayons(data as unknown as LigneSousRayon[], lang);
}

export function construireSousRayons(lignes: LigneSousRayon[], lang: Lang): OptionSousRayon[] {
  const parId = new Map(lignes.map((l) => [l.id, l]));
  const out: OptionSousRayon[] = [];
  for (const l of lignes) {
    if (l.level !== 2 && l.level !== 3) continue;
    const parent = l.parent_id ? parId.get(l.parent_id) : undefined;
    if (!parent) continue; // parent inactif ou absent : la feuille ne remonte pas seule
    const departement = l.level === 2 ? parent : parent.parent_id ? parId.get(parent.parent_id) : undefined;
    if (!departement || departement.level !== 1) continue;
    out.push({
      id: l.id,
      departement: departement.label_fr,
      chemin: l.level === 3 ? `${libelle(parent, lang)} › ${libelle(l, lang)}` : libelle(l, lang),
      level: l.level,
    });
  }
  return out.sort(
    (a, b) => a.departement.localeCompare(b.departement, "fr") || a.chemin.localeCompare(b.chemin, "fr")
  );
}

/**
 * Liste blanche SERVEUR du sous-rayon : l'identifiant reçu doit être un
 * sous-rayon ACTIF dont le département est `departementLabelFr` — celui que
 * `normalizeCategory` vient de valider. Rend l'identifiant, ou `null`.
 *
 * Un `categoryId` d'un AUTRE département est refusé, pas corrigé : la fiche
 * porterait un rayon dans `category` et un autre dans `category_id`, et les
 * facettes mentiraient. Absent ou vide → `null` sans erreur : le sous-rayon
 * est facultatif, le département suffit.
 */
export async function normalizeSousRayon(
  client: SupabaseClient,
  input: unknown,
  departementLabelFr: string
): Promise<{ ok: true; id: string | null } | { ok: false }> {
  if (input === undefined || input === null || input === "") return { ok: true, id: null };
  if (typeof input !== "string") return { ok: false };
  const options = await lireSousRayonsPublication(client, "fr");
  const trouve = options.find((o) => o.id === input && o.departement === departementLabelFr);
  return trouve ? { ok: true, id: trouve.id } : { ok: false };
}
