import { usdCentsFromHtg } from "../payment-utils";
import type { Audience } from "./rule";

/**
 * Prix de la surcouche Zabelie — composé par Zabelie, JAMAIS envoyé au moteur
 * d'image (R-STUDIO-01, extrait §2).
 *
 * « Prix affiché = prix réel du catalogue uniquement » : la seule source est
 * `price_htg` du produit. Aucun champ de promotion, de prix barré ou de remise
 * n'existe ici — ce qui n'a pas d'entrée ne peut pas être inventé.
 *
 * L'USD est le MÊME calcul que le checkout (`usdCentsFromHtg`,
 * lib/payment-utils.ts) avec le MÊME taux, pour que le prix affiché soit celui
 * que l'acheteur paiera. Taux absent ou invalide → pas d'USD, et on le dit.
 *
 * ⚠️ PROPOSITION (lecture de « HTG, USD ou les deux selon l'audience ») :
 * haiti → HTG · diaspora, international → USD · haiti_diaspora → les deux.
 */
export type PrixSurcouche = {
  htg: number | null;
  usd_cents: number | null;
  manquant: "usd_taux_indisponible" | null;
};

export function devisesPour(audience: Audience): { htg: boolean; usd: boolean } {
  switch (audience) {
    case "haiti": return { htg: true, usd: false };
    case "diaspora": return { htg: false, usd: true };
    case "international": return { htg: false, usd: true };
    case "haiti_diaspora": return { htg: true, usd: true };
  }
}

export function prixSurcouche(produit: { price_htg: number }, audience: Audience, htgPerUsd: number | null): PrixSurcouche {
  if (!Number.isInteger(produit.price_htg) || produit.price_htg <= 0) throw new Error("prix_catalogue_invalide");
  const d = devisesPour(audience);
  let usd: number | null = null;
  let manquant: PrixSurcouche["manquant"] = null;
  if (d.usd) {
    try { usd = usdCentsFromHtg(produit.price_htg, htgPerUsd ?? NaN); }
    catch { manquant = "usd_taux_indisponible"; }
  }
  // Diaspora seule sans taux : plutôt le HTG réel qu'aucun prix, ou qu'un prix inventé.
  const htg = d.htg || (d.usd && usd === null) ? produit.price_htg : null;
  return { htg, usd_cents: usd, manquant };
}
