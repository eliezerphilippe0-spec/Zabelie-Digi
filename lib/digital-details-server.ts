import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/products";
import { DIGITAL_DETAIL_FIELDS, type DigitalDetails } from "@/lib/digital-details";

export async function getDigitalDetails(ids: string[]): Promise<Map<string, DigitalDetails> | null> {
  if (!isSupabaseConfigured() || ids.length === 0) return new Map();
  const client = await createClient();
  const { data, error } = await client.from("zabelie_digital_details")
    .select(`product_id,${DIGITAL_DETAIL_FIELDS.join(",")}`).in("product_id", ids);
  // Missing schema or transient read: do not invent facts; saving still fails explicitly.
  if (error) return null;
  return new Map((data ?? []).map((row) => {
    const r = row as unknown as DigitalDetails & { product_id: string };
    return [r.product_id, Object.fromEntries(DIGITAL_DETAIL_FIELDS.map((key) => [key, r[key]])) as DigitalDetails];
  }));
}
