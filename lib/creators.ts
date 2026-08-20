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

/**
 * La fiche publique passe par `zabelie_boutik_public` (`0084`), jamais par un
 * `select` direct sur `profiles`.
 *
 * ⚠️ CE N'EST PAS UN DÉTAIL DE STYLE — c'est la réparation d'une panne. Mesuré
 * en production le 2026-08-18, sous le rôle `anon` réel : le `select` que ce
 * fichier faisait auparavant était REFUSÉ (« permission denied for table
 * profiles »), et les deux pages appelaient `notFound()`. `profiles` porte
 * depuis `0015` une liste blanche de colonnes ; `zone_id`, `pwen_repe`
 * (`0069`) et `boutik_slug` (`0083`) n'y ont jamais été ajoutés. Citer l'une
 * d'elles — même seulement dans un `.eq()` — fait refuser toute la requête.
 *
 * Élargir la liste blanche aurait ouvert ces colonnes sur TOUS les profils,
 * acheteurs compris : la RLS de `profiles` vaut `true` pour toute ligne, un
 * grant de colonne n'a pas de prédicat. La fonction, si — elle ne rend une
 * fiche que pour un marchand.
 */
type FichePublique = {
  id: string;
  display_name: string;
  bio: string | null;
  avatar_url: string | null;
  zone_id: string | null;
  pwen_repe: string | null;
  boutik_slug: string | null;
};

/**
 * `0084` pas encore appliquée : PostgREST rend `PGRST202` (fonction absente).
 * On ne veut pas que le code déployé avant la migration remette les deux
 * pages en 404 — le repli lit les seules colonnes que `0015` accorde depuis
 * toujours, et la fiche s'affiche sans zone ni point de repère.
 */
function fonctionAbsente(
  error: { code?: string; message?: string } | null
): boolean {
  if (!error) return false;
  return (
    error.code === "PGRST202" ||
    error.code === "42883" ||
    /function .*zabelie_boutik_public.* does not exist/i.test(error.message ?? "")
  );
}

async function fichePublique(
  critere: { p_id: string; p_slug: null } | { p_id: null; p_slug: string }
): Promise<FichePublique | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("zabelie_boutik_public", critere);

  if (!error) return (data as FichePublique | null) ?? null;
  if (!fonctionAbsente(error)) {
    /* Le CODE seul disait « undefined » sur une panne réseau — mesuré le
       2026-08-20, au moment précis où j'essayais de diagnostiquer. Un code
       PostgREST n'existe que pour une erreur PostgREST ; une coupure, un hôte
       injoignable ou un DNS mort n'en portent pas. On journalise donc les
       deux, sinon la ligne se tait exactement quand elle devrait parler. */
    console.error(
      "[boutique] fiche publique refusée",
      error.code ?? "sans_code",
      error.message ?? ""
    );
    return null;
  }

  /* Repli d'avant-migration. Il ne sait résoudre que par id : filtrer sur
     `boutik_slug` est précisément ce que la liste blanche refuse, donc
     `/boutik/[slug]` reste en 404 tant que `0084` n'est pas appliquée — la
     vérité, plutôt qu'une correspondance inventée. */
  if (critere.p_id === null) return null;
  const { data: brut } = await supabase
    .from("profiles")
    .select("id, display_name, bio, avatar_url")
    .eq("id", critere.p_id)
    .maybeSingle();
  if (!brut) return null;
  return {
    id: brut.id,
    display_name: brut.display_name,
    bio: brut.bio,
    avatar_url: brut.avatar_url,
    zone_id: null,
    pwen_repe: null,
    boutik_slug: null,
  };
}

async function versCreatorProfile(
  fiche: FichePublique
): Promise<CreatorProfile> {
  const products = await getProductsBySeller(fiche.id);
  return {
    id: fiche.id,
    displayName: fiche.display_name,
    bio: fiche.bio,
    avatarUrl: fiche.avatar_url,
    zoneId: fiche.zone_id ?? null,
    pwenRepe: fiche.pwen_repe ?? null,
    boutikSlug: fiche.boutik_slug ?? null,
    products,
  };
}

export async function getCreator(id: string): Promise<CreatorProfile | null> {
  if (!isSupabaseConfigured()) return null;
  const fiche = await fichePublique({ p_id: id, p_slug: null });
  if (!fiche) return null;
  return versCreatorProfile(fiche);
}

/**
 * Résout une adresse publique vers son profil.
 *
 * Rend `null` si `0084` n'est pas appliquée : `/boutik/x` répond alors 404,
 * ce qui est la vérité — la résolution d'adresse n'existe pas encore.
 * Inventer une correspondance serait pire que l'absence.
 */
export async function getCreatorBySlug(
  slug: string
): Promise<CreatorProfile | null> {
  if (!isSupabaseConfigured()) return null;
  const fiche = await fichePublique({ p_id: null, p_slug: slug });
  if (!fiche) return null;
  return versCreatorProfile(fiche);
}
