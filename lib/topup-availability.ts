import { createAdminClient } from "@/lib/supabase/admin";
import { cache } from "react";
export type TopupAvailability = "unavailable" | "sandbox" | "configured";
export function topupConfiguration(env: Partial<NodeJS.ProcessEnv> = process.env): TopupAvailability {
  if (env.ZABELIE_TOPUP_FIRSTPARTY_ENABLED !== "true" || !env.RELOADLY_CLIENT_ID?.trim() || !env.RELOADLY_CLIENT_SECRET?.trim()) return "unavailable";
  if (env.RELOADLY_MODE === "sandbox") return "sandbox";
  return env.RELOADLY_MODE === "production" ? "configured" : "unavailable";
}
export const getTopupAvailability = cache(async (): Promise<TopupAvailability> => {
  const configuration = topupConfiguration();
  if (configuration !== "configured") return configuration;
  try {
    const db = createAdminClient();
    const { data, error } = await db.from("zabelie_topup_products").select("id,provider_product_id").eq("active", true).not("provider_product_id", "is", null).limit(100);
    if (error || !data?.some(p => String(p.provider_product_id ?? "").trim())) return "unavailable";
    return "configured";
  } catch { return "unavailable"; }
});
