/** Display estimates only. PostgreSQL freezes and settles the actual fees. */
export type SaleSource = "direct" | "discovery";
export type SellerPricing = {
  direct_rate_bps: number;
  direct_fixed_usd_cents: number;
  discovery_rate_bps: number;
  usd_htg_micros: number;
  launch_days: number;
  submission_days: number;
  launch_sales_limit: number;
  launch_discount_bps: number;
  payments_ready: boolean;
  attribution_days: number;
};

function integer(value: number): bigint {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("invalid_pricing_amount");
  return BigInt(value);
}

export function fixedFeeHTG(pricing: SellerPricing): number {
  return Number(integer(pricing.direct_fixed_usd_cents) * integer(pricing.usd_htg_micros) / 100_000_000n);
}

export function sellerFeeHTG(gross: number, source: SaleSource, pricing: SellerPricing, launch = false): number {
  const amount = integer(gross);
  const rate = integer(source === "discovery" ? pricing.discovery_rate_bps : pricing.direct_rate_bps);
  const fixed = source === "direct" ? BigInt(fixedFeeHTG(pricing)) : 0n;
  if (amount === 0n) return 0;
  const normal = amount * rate / 10_000n + fixed;
  const bounded = normal > amount ? amount : normal;
  const discount = launch ? integer(pricing.launch_discount_bps) : 0n;
  if (discount > 10_000n) throw new Error("invalid_pricing_discount");
  return Number(bounded * (10_000n - discount) / 10_000n);
}

export type SellerLaunch = {
  observed_at?: number;
  submitted_at: string | null;
  published_at: string | null;
  starts_at: string | null;
  ends_at: string | null;
  submission_deadline: string;
  used_sales: number;
  sales_limit: number;
  eligible: boolean;
};

export function launchState(launch: SellerLaunch, now = Date.now()): "submit" | "waiting" | "active" | "expired" | "exhausted" | "ineligible" {
  if (!launch.submitted_at) return now < Date.parse(launch.submission_deadline) ? "submit" : "ineligible";
  if (!launch.eligible) return "ineligible";
  if (launch.used_sales >= launch.sales_limit) return "exhausted";
  if (!launch.starts_at || !launch.ends_at || now < Date.parse(launch.starts_at)) return "waiting";
  return now < Date.parse(launch.ends_at) ? "active" : "expired";
}
