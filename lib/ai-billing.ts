import type { SupabaseClient } from "@supabase/supabase-js";

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
