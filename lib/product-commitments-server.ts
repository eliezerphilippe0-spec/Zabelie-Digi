import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/products";
import type { ProductCommitment } from "./product-commitments";

/** Missing migration or unavailable database is explicit, never a false confirmation. */
export async function getProductCommitments(ids: string[]): Promise<Map<string, ProductCommitment> | null> {
  if (!isSupabaseConfigured()) return null;
  if (!ids.length) return new Map();
  try {
    const db = await createClient();
    const { data, error } = await db.from("zabelie_product_commitments").select("*").in("product_id", ids);
    return error ? null : new Map((data ?? []).map(p => [p.product_id, p as ProductCommitment]));
  } catch { return null; }
}
