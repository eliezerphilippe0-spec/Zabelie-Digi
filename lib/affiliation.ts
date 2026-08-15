import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingTable } from "@/lib/product-media";

/** Cookie d'attribution. 7 jours — la fenêtre Jumia, pas les 24 h d'Amazon
 * calibrées pour un trafic qu'on n'a pas (docs/37 §A). Constante technique :
 * changer sa durée ne changerait rien aux cookies déjà posés. */
export const REF_COOKIE = "zab_ref";
export const REF_COOKIE_JOURS = 7;
/** Format d'un code affilié — opaque, jamais un nom. Partagé par la table
 * (contrainte SQL), le proxy (validation avant pose du cookie) et la
 * génération. */
export const CODE_RE = /^[a-z0-9]{6,16}$/;

export function genererCode(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789"; // sans l/1/o/0
  let code = "";
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  for (const b of bytes) code += alphabet[b % alphabet.length];
  return code;
}

export async function affiliationActive(admin: SupabaseClient): Promise<boolean> {
  try {
    const { data, error } = await admin
      .from("zabelie_affiliate_config")
      .select("actif")
      .maybeSingle();
    if (error || !data) return false;
    return data.actif === true;
  } catch {
    return false;
  }
}

/**
 * Attribution d'une commande à un affilié — FIGÉE à la création (leçon
 * Jumia). Best-effort intégral : AUCUN échec ici ne doit faire échouer un
 * checkout — un code cassé est un code ignoré, journalisé, jamais un
 * acheteur bloqué.
 *
 * Conditions, toutes vérifiées en base à l'instant T :
 *   config.actif · le code existe · le vendeur a offert un taux sur CE
 *   produit · l'affilié n'est ni l'acheteur ni le vendeur.
 */
export async function attribuerCommande(
  admin: SupabaseClient,
  args: {
    orderId: string;
    productId: string;
    buyerId: string;
    sellerId: string;
    code: string | null;
  }
): Promise<void> {
  try {
    if (!args.code || !CODE_RE.test(args.code)) return;
    if (!(await affiliationActive(admin))) return;

    const [{ data: aff }, { data: rate }] = await Promise.all([
      admin
        .from("zabelie_affiliates")
        .select("user_id")
        .eq("code", args.code)
        .maybeSingle(),
      admin
        .from("zabelie_affiliate_rates")
        .select("rate_bps")
        .eq("product_id", args.productId)
        .maybeSingle(),
    ]);
    if (!aff || !rate) return;
    if (aff.user_id === args.buyerId || aff.user_id === args.sellerId) return;

    const { error } = await admin.from("zabelie_order_attribution").insert({
      order_id: args.orderId,
      affiliate_id: aff.user_id,
      rate_bps: rate.rate_bps,
    });
    if (error && !isMissingTable(error)) {
      console.log(
        "[affiliation]",
        JSON.stringify({
          at: new Date().toISOString(),
          issue: "attribution_echouee",
          orderId: args.orderId,
          message: error.message,
        })
      );
    }
  } catch {
    // Silencieux par contrat : le checkout ne doit jamais tomber pour ça.
  }
}
