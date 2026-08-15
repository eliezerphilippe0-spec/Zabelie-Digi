import type { SupabaseClient } from "@supabase/supabase-js";
import { t, type Lang } from "@/lib/i18n";

/**
 * Surplus IA — lecture de configuration et registre (docs/34).
 *
 * ─── LE REPLI EST LE GRATUIT, JAMAIS LA FACTURATION ─────────────────────────
 * Tant que `0071` n'est pas appliquée (table absente) — ou qu'une lecture
 * échoue — `lireConfigSurplus` rend `null` et la route retombe sur le
 * comportement historique : blocage gratuit au quota. On ne facture pas sur
 * un repli, et on ne DÉBLOQUE pas non plus sur un repli.
 *
 * ─── JAMAIS DE GÉNÉRATION NON FACTURÉE ──────────────────────────────────────
 * `enregistrerSurplus` s'appelle AVANT l'appel fournisseur, et son échec
 * arrête tout (la route répond 502). Le sens inverse — générer d'abord,
 * facturer ensuite — perdrait des lignes sur chaque panne d'insertion, en
 * silence, toujours au détriment de la plateforme.
 */

export type AiSurplusConfig = {
  quotaGratuitJour: number;
  prixSurplusHtg: number;
  plafondJour: number;
};

/** Défauts compilés = ceux posés par `0071` — le test croisé les compare. */
export const SURPLUS_DEFAUTS: AiSurplusConfig = {
  quotaGratuitJour: 50,
  prixSurplusHtg: 5,
  plafondJour: 200,
};

export async function lireConfigSurplus(
  admin: SupabaseClient
): Promise<AiSurplusConfig | null> {
  try {
    const { data, error } = await admin
      .from("zabelie_ai_config")
      .select("quota_gratuit_jour, prix_surplus_htg, plafond_jour")
      .maybeSingle();
    if (error || !data) return null;
    return {
      quotaGratuitJour: data.quota_gratuit_jour,
      prixSurplusHtg: data.prix_surplus_htg,
      plafondJour: data.plafond_jour,
    };
  } catch {
    return null;
  }
}

/**
 * Le tarif à AFFICHER D'EMBLÉE sous le bouton d'aide (décision porteur
 * 2026-08-15 : le vendeur doit connaître le prix AVANT d'épuiser le quota,
 * pas au moment du dépassement). Quota et prix viennent de la BASE —
 * `undefined` tant que 0071 n'est pas appliquée : on n'annonce pas un tarif
 * qui n'existe pas, et la surface se tait.
 */
export async function tarifSurplusAffiche(
  admin: SupabaseClient,
  lang: Lang
): Promise<string | undefined> {
  const cfg = await lireConfigSurplus(admin);
  if (!cfg) return undefined;
  return t(lang, "ai.desc.tarif")
    .replace("{quota}", String(cfg.quotaGratuitJour))
    .replace("{prix}", String(cfg.prixSurplusHtg));
}

/**
 * Inscrit UNE suggestion facturée, au prix du moment. `false` = rien n'est
 * inscrit, l'appelant ne doit PAS générer.
 */
export async function enregistrerSurplus(
  admin: SupabaseClient,
  sellerId: string,
  prixHtg: number
): Promise<boolean> {
  try {
    const { error } = await admin
      .from("zabelie_ai_surplus")
      .insert({ seller_id: sellerId, prix_htg: prixHtg });
    return !error;
  } catch {
    return false;
  }
}
