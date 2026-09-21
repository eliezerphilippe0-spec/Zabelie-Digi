import type { SupabaseClient } from "@supabase/supabase-js";
import { isTrackedStockKind, type ProductKind } from "@/lib/product-kind";

type ProductPrice = { id: string; kind: ProductKind; price_htg: number };
type PriceResult = { ok: true; priceHTG: number; variantId: string | null; quantity: number }
  | { ok: false; code: "variant_required" | "variant_invalid" | "quantity_invalid" | "price_unavailable" };

/** Le prix vient de la variante active du produit, jamais du navigateur. */
export async function readPurchasePrice(
  client: SupabaseClient, product: ProductPrice, variantInput: unknown, quantityInput: unknown = 1,
): Promise<PriceResult> {
  const supplied = variantInput !== undefined && variantInput !== null;
  if (supplied && (typeof variantInput !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(variantInput))) {
    return { ok: false, code: "variant_invalid" };
  }
  if (!isTrackedStockKind(product.kind)) {
    return supplied ? { ok: false, code: "variant_invalid" }
      : { ok: true, priceHTG: product.price_htg, variantId: null, quantity: 1 };
  }
  const quantity = quantityInput === undefined ? 1 : quantityInput;
  if (typeof quantity !== "number" || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 2147483647) {
    return { ok: false, code: "quantity_invalid" };
  }
  let query = client.from("zabelie_product_variants").select("id, price_htg")
    .eq("product_id", product.id).eq("active", true);
  if (supplied) query = query.eq("id", variantInput as string);
  const { data, error } = await query.limit(2);
  if (error) return { ok: false, code: "price_unavailable" };
  if (!data?.length) return { ok: false, code: "variant_invalid" };
  if (data.length !== 1) return { ok: false, code: "variant_required" };
  const priceHTG = data[0].price_htg * quantity;
  if (!Number.isSafeInteger(priceHTG) || priceHTG <= 0 || priceHTG > 2147483647) {
    return { ok: false, code: "quantity_invalid" };
  }
  return { ok: true, priceHTG, variantId: data[0].id, quantity };
}
