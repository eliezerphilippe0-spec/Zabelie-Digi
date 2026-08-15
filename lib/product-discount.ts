import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingColumn } from "@/lib/products";

/**
 * Rabais (V-4, docs/35) — lectures tolérantes.
 *
 * `compare_at_htg` n'existe qu'après 0075 : toute lecture nommée rendrait
 * 42703 avant — ces helpers rendent alors null/vide, et AUCUNE surface de
 * rabais n'apparaît. La règle d'honnêteté vit en base (contrainte + RPC de
 * 0075) : ici on ne fait que lire.
 */

/** L'ancien prix d'UN produit, ou null (pas de rabais, ou 0075 absente). */
export async function lireComparePrix(
  supabase: SupabaseClient,
  productId: string
): Promise<number | null> {
  const { data, error } = await supabase
    .from("products")
    .select("compare_at_htg")
    .eq("id", productId)
    .maybeSingle();
  if (error) {
    if (!isMissingColumn(error)) {
      console.error("[rabais] lecture échouée", error.code);
    }
    return null;
  }
  const v = (data as { compare_at_htg?: number | null } | null)?.compare_at_htg;
  return typeof v === "number" && v > 0 ? v : null;
}

/** Les anciens prix des produits d'un VENDEUR — map vide si 0075 absente. */
export async function lireCompares(
  supabase: SupabaseClient,
  sellerId: string
): Promise<Map<string, number>> {
  const { data, error } = await supabase
    .from("products")
    .select("id, compare_at_htg")
    .eq("seller_id", sellerId)
    .not("compare_at_htg", "is", null);
  if (error || !data) return new Map();
  return new Map(
    (data as { id: string; compare_at_htg: number }[]).map((r) => [
      r.id,
      r.compare_at_htg,
    ])
  );
}

/** Le pourcentage affiché « −X % » — arrondi, jamais un calcul client. */
export function pourcentageRabais(compare: number, prix: number): number {
  if (compare <= 0 || prix >= compare) return 0;
  return Math.round(((compare - prix) / compare) * 100);
}
