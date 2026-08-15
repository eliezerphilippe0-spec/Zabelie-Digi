import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Galerie produit (V-1A, docs/35) — lecture tolérante et URL dérivée.
 *
 * ─── DORMANT SANS 0073 ──────────────────────────────────────────────────────
 * Tant que la migration n'est pas appliquée, `listerMedias` rend `[]` sur le
 * code 42P01 (table absente) : la fiche montre la couverture seule, comme
 * avant — aucune erreur, aucune surface. Le même repli couvre PGRST205
 * (cache de schéma PostgREST), pour la même raison que `isMissingFunction`
 * porte deux codes : n'en lire qu'un rate le cas dans la moitié des
 * déploiements.
 *
 * L'URL publique se DÉRIVE du chemin de stockage, elle n'est jamais stockée :
 * une URL en base se périme au premier changement de domaine de stockage.
 */

export const MEDIA_BUCKET = "product-covers";
export const MAX_IMAGES_PER_PRODUCT = 6;

/** Arbitrages porteur du 2026-08-15 (« 60s et 50 Mo ok ») — V-1B, docs/35. */
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
export const MAX_VIDEO_SECONDS = 60;

/**
 * Le chemin vidéo ISSU DU SERVEUR, revalidé à la confirmation : le client
 * rapporte le chemin qu'on lui a signé, il ne choisit rien — et un chemin
 * hors du dossier galerie du produit est refusé avant toute lecture.
 */
export function cheminVideoValide(productId: string, path: string): boolean {
  const re = new RegExp(
    `^${productId}/galerie/vid-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.(mp4|webm)$`
  );
  return re.test(path);
}

export type ProductMedia = {
  id: string;
  kind: "image" | "video";
  url: string;
  position: number;
};

/** La table n'existe pas (0073 non appliquée) — par CODE, jamais par texte. */
export function isMissingTable(
  error: { code?: string | null } | null | undefined
): boolean {
  const code = error?.code ?? "";
  return code === "42P01" || code === "PGRST205";
}

export async function listerMedias(
  supabase: SupabaseClient,
  productId: string
): Promise<ProductMedia[]> {
  const { data, error } = await supabase
    .from("zabelie_product_media")
    .select("id, kind, storage_path, position")
    .eq("product_id", productId)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) {
    if (!isMissingTable(error)) {
      console.error("[product-media] lecture échouée", error.code);
    }
    return [];
  }
  return (data ?? []).map((m) => ({
    id: m.id,
    kind: m.kind as "image" | "video",
    url: supabase.storage.from(MEDIA_BUCKET).getPublicUrl(m.storage_path).data
      .publicUrl,
    position: m.position,
  }));
}
