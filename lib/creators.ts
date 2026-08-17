import { createClient } from "@/lib/supabase/server";
import {
  isSupabaseConfigured,
  getProductsBySeller,
  type ProductView,
} from "@/lib/products";

export type CreatorProfile = {
  id: string;
  displayName: string;
  bio: string | null;
  avatarUrl: string | null;
  /** Zone déclarée (0069) — null tant que le vendeur ne l'a pas choisie. */
  zoneId: string | null;
  /** Point de repère libre, public par construction (docs/33 §3). */
  pwenRepe: string | null;
  /**
   * Adresse publique lisible (`0083`). `null` = pas d'adresse, ou migration
   * pas encore appliquée — dans les deux cas le code retombe sur
   * `/createur/<id>`, qui ne cesse jamais de fonctionner.
   */
  boutikSlug: string | null;
  products: ProductView[];
};

export async function getCreator(id: string): Promise<CreatorProfile | null> {
  if (!isSupabaseConfigured()) return null;

  const supabase = await createClient();
  /* Sélection TOLÉRANTE : `boutik_slug` n'existe qu'après `0083`, et le code
     se déploie tout seul quand les migrations s'appliquent à la main. Une
     colonne pas encore migrée doit dégrader — une boutique sans adresse
     lisible reste une boutique, un 500 n'est plus rien. */
  const COLONNES = "id, display_name, bio, avatar_url, zone_id, pwen_repe";
  let { data: profile } = await supabase
    .from("profiles")
    .select(`${COLONNES}, boutik_slug`)
    .eq("id", id)
    .maybeSingle();
  if (!profile) {
    ({ data: profile } = await supabase
      .from("profiles")
      .select(COLONNES)
      .eq("id", id)
      .maybeSingle());
  }

  if (!profile) return null;

  const products = await getProductsBySeller(id);

  return {
    id: profile.id,
    displayName: profile.display_name,
    bio: profile.bio,
    avatarUrl: profile.avatar_url,
    zoneId: profile.zone_id ?? null,
    pwenRepe: profile.pwen_repe ?? null,
    boutikSlug:
      (profile as { boutik_slug?: string | null }).boutik_slug ?? null,
    products,
  };
}

/**
 * Résout une adresse publique vers son profil.
 *
 * Rend `null` si `0083` n'est pas appliquée (colonne absente) : `/boutik/x`
 * répond alors 404, ce qui est la vérité — l'adresse n'existe pas encore.
 * Inventer une correspondance serait pire que l'absence.
 */
export async function getCreatorBySlug(
  slug: string
): Promise<CreatorProfile | null> {
  if (!isSupabaseConfigured()) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("boutik_slug", slug)
    .maybeSingle();

  if (error || !data) return null;
  return getCreator(data.id);
}
