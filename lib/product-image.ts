/**
 * Dimensionnement des photos produits — au CDN, pas au rendu.
 *
 * Erreur corrigée ici : `loading="lazy"` et `decoding="async"` diffèrent le
 * chargement et débloquent le rendu, ils ne retirent **aucun octet**. Une
 * photo de 5 Mo reste une photo de 5 Mo quand elle arrive — sur une grille de
 * catalogue en 3G, c'est exactement le scénario qu'on cherche à éviter.
 *
 * Voie retenue : les **transformations d'image de Supabase Storage**. La
 * largeur et la qualité passent dans l'URL, le redimensionnement se fait au
 * CDN — aucun quota Vercel consommé, ~40 Ko au lieu de 5 Mo, et c'est une
 * modification d'URL, pas une refonte. Le chantier « redimensionner à
 * l'upload » reste souhaitable ; il n'est plus urgent.
 *
 * ⚠️ Les transformations sont une fonctionnalité de plan Supabase. Non
 * activées, l'endpoint `render/image` répond en erreur et les photos ne
 * s'afficheraient plus — donc **désactivé par défaut** et gouverné par
 * `NEXT_PUBLIC_SUPABASE_IMAGE_TRANSFORM`. Sans la variable, on sert l'URL
 * d'origine : plus lourd, mais jamais cassé. Vérifier le plan, puis activer
 * (cf. `OPS_TODO.md`).
 */

const ENABLED = process.env.NEXT_PUBLIC_SUPABASE_IMAGE_TRANSFORM === "1";

/** Largeurs de rendu par surface — le plus petit qui reste net en 2×. */
export const COVER_WIDTHS = {
  /** Carte de catalogue : bloc de 160 px de haut, grille jusqu'à 3 colonnes. */
  card: 640,
  /** Fiche produit : visuel principal, une colonne sur mobile. */
  detail: 1000,
  /** Panneau droit de la carte de partage (430×630 dans l'image 1200×630). */
  share: 860,
} as const;

/**
 * Réécrit une URL publique Supabase Storage vers l'endpoint de transformation.
 * Toute autre URL (hôte tiers, chemin inattendu) est renvoyée telle quelle :
 * on ne fabrique jamais une URL qu'on n'est pas sûr de pouvoir servir.
 */
export function coverUrlAt(
  url: string | null,
  width: number,
  quality = 70
): string | null {
  if (!url) return null;
  if (!ENABLED) return url;
  if (!url.includes("/storage/v1/object/public/")) return url;

  const rendered = url.replace(
    "/storage/v1/object/public/",
    "/storage/v1/render/image/public/"
  );
  // L'URL porte déjà un cache-buster `?v=…` posé à l'upload : on ajoute donc
  // les paramètres, on ne les remplace pas.
  const sep = rendered.includes("?") ? "&" : "?";
  return `${rendered}${sep}width=${width}&quality=${quality}&resize=cover`;
}
