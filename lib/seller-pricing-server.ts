import type { SupabaseClient } from "@supabase/supabase-js";
import type { SellerLaunch, SellerPricing } from "./seller-pricing";

export async function readSellerPricing(client: SupabaseClient): Promise<SellerPricing | null> {
  const { data, error } = await client.from("zabelie_seller_pricing_config")
    .select("enabled,direct_rate_bps,direct_fixed_usd_cents,discovery_rate_bps,usd_htg_micros,launch_days,submission_days,launch_sales_limit,launch_discount_bps,payments_ready,attribution_days")
    .eq("id", true).maybeSingle();
  // A rolling deployment may precede the additive migration; only a genuinely
  // absent table means legacy pricing. A network failure must not invent a fee.
  if (error && !["42P01", "PGRST205"].includes(error.code)) throw new Error("seller_pricing_unavailable");
  if (error || !data?.enabled) return null;
  if (!Number.isSafeInteger(data.usd_htg_micros) || data.usd_htg_micros <= 0) throw new Error("seller_pricing_fx_missing");
  return data as SellerPricing;
}

export async function readSellerLaunch(client: SupabaseClient, sellerId: string, pricing: SellerPricing, signedUpAt?: string): Promise<SellerLaunch | null> {
  const { data: launch, error } = await client.from("zabelie_seller_launch")
    .select("submitted_at,submission_deadline,published_at,eligible,starts_at,ends_at,used_sales,sales_limit")
    .eq("seller_id", sellerId).maybeSingle();
  if (error) return null;
  if (launch) return { ...launch, observed_at: Date.now() } as SellerLaunch;
  if (!signedUpAt || !Number.isFinite(Date.parse(signedUpAt))) return null;
  return {
    observed_at: Date.now(),
    submitted_at: null, published_at: null, starts_at: null, ends_at: null,
    submission_deadline: new Date(Date.parse(signedUpAt) + pricing.submission_days * 86_400_000).toISOString(),
    used_sales: 0, sales_limit: pricing.launch_sales_limit, eligible: false,
  };
}
