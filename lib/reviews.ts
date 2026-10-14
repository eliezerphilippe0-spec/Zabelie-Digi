import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/products";

export type ReviewView = {
  id: string;
  rating: number;
  comment: string | null;
  /** « Prénom + initiale » (0137), ou `null` : le libellé de repli est traduit par l'écran. */
  buyerName: string | null;
  createdAt: string;
  /** Réponse publique du vendeur (0139), une seule par avis. */
  reponse: { texte: string; le: string } | null;
};

/**
 * Avis vérifiés d'un produit PUBLIÉ, par `zabelie_avis_produit` (0137).
 *
 * Plus de jointure vers `profiles` : la lecture publique des comptes est
 * fermée aux non-marchands, et `buyer_id` n'est plus lisible par les rôles
 * client. La fonction rend l'auteur déjà réduit à « Prénom + initiale »
 * (décision porteur du 2026-10-14) : le nom complet ne quitte pas la base.
 */
export async function getProductReviews(
  productId: string
): Promise<ReviewView[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("zabelie_avis_produit", {
    p_product_id: productId,
    p_limite: 20,
  });
  if (error) {
    // L'absence de signal doit rester un signal : sans ce journal, « aucun
    // avis » et « la fonction manque en base » afficheraient la même fiche.
    console.warn("[avis] lecture indisponible", error.message);
    return [];
  }

  type Row = {
    id: string;
    rating: number;
    comment: string | null;
    created_at: string;
    auteur: string | null;
    reponse_vendeur: string | null;
    reponse_le: string | null;
  };

  return ((data ?? []) as Row[]).map((r) => ({
    id: r.id,
    rating: r.rating,
    comment: r.comment,
    buyerName: r.auteur,
    createdAt: r.created_at,
    reponse: r.reponse_vendeur && r.reponse_le ? { texte: r.reponse_vendeur, le: r.reponse_le } : null,
  }));
}

/** Ids de commandes du lot ayant déjà un avis (pour /mes-achats). */
export async function getReviewedOrderIds(
  orderIds: string[]
): Promise<Set<string>> {
  if (!isSupabaseConfigured() || orderIds.length === 0) return new Set();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Set();

  // 0137 : `order_id` n'est plus lisible par les rôles client. Le serveur lit
  // avec la clé de service, BORNÉ à l'acheteur de la session : la liste
  // reçue en paramètre ne suffit pas à ouvrir les avis de quelqu'un d'autre.
  const admin = createAdminClient();
  const { data } = await admin
    .from("product_reviews")
    .select("order_id")
    .eq("buyer_id", user.id)
    .in("order_id", orderIds);

  return new Set((data ?? []).map((r) => r.order_id as string));
}
