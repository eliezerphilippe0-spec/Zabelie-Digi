import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/products";

/**
 * LE DÉLAI CONSTATÉ (0165) — ce que les remises passées disent d'un vendeur, au
 * lieu de ce qu'il annonce (docs/77 §12.5).
 *
 * `zabelie_delai_constate` rend trois entiers : le nombre de commandes qui ont servi,
 * le délai médian en heures (NULL tant que l'échantillon est sous le seuil de la
 * config) et ce seuil. Le calcul est en base ; ce module ne fait que LIRE et décider
 * ce qui s'affiche.
 *
 * ⚠️ FAIL-CLOSED. Sur toute erreur — fonction absente tant que 0165 n'est pas
 * appliquée, incident — la réponse est `null`, c'est-à-dire AUCUNE ligne affichée :
 * jamais un délai inventé. Et c'est journalisé, sinon « pas encore assez de
 * commandes » et « la lecture a échoué » montreraient la même fiche.
 *
 * ⚠️ Service-role, comme la fonction : les lignes de `zabelie_fulfillment` ne sont
 * pas lisibles du public, et la fonction ne rend que des agrégats. Le `sellerId`
 * vient de la fiche produit ou de la SESSION du vendeur, jamais d'un paramètre
 * d'URL ou d'un corps de requête.
 */
export type DelaiConstate = {
  /** Réceptions confirmées prises en compte (fenêtre de la config, hors automatiques). */
  nb: number;
  /** `null` sous le seuil : rien ne doit être affiché. */
  medianeHeures: number | null;
  /** Le seuil de la config, pour dire au vendeur combien il lui manque. */
  seuil: number;
};

const entier = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);

/**
 * Lit la réponse brute de la RPC. Une forme inattendue rend `null` plutôt qu'un
 * demi-objet : on n'affiche pas un chiffre dont on ne sait pas d'où il vient.
 */
export function lireDelaiConstate(data: unknown): DelaiConstate | null {
  const ligne = Array.isArray(data) ? data[0] : data;
  if (!ligne || typeof ligne !== "object") return null;
  const { nb, mediane_heures: mediane, seuil } = ligne as Record<string, unknown>;
  if (!entier(nb) || nb < 0 || !entier(seuil) || seuil < 1) return null;
  if (mediane !== null && mediane !== undefined && (!entier(mediane) || mediane < 1)) return null;
  return { nb, medianeHeures: mediane ?? null, seuil };
}

/**
 * Le délai MONTRÉ aux acheteurs : la médiane, seulement si la base l'a rendue (donc
 * seuil atteint). Le seuil n'est PAS recalculé ici — une seconde règle dans le code
 * divergerait de la config. Une médiane présente avec un échantillon sous le seuil
 * est une incohérence : rien n'est affiché.
 */
export function delaiAffichable(d: DelaiConstate | null): number | null {
  if (!d || d.medianeHeures === null) return null;
  return d.nb >= d.seuil ? d.medianeHeures : null;
}

/** « 24 h » jusqu'à 48 heures, « 3 j » au-delà — même règle que les conditions annoncées. */
export function uniteDelai(heures: number): { cle: "zr.unit.hours" | "zr.unit.days"; n: number } {
  return heures < 48 ? { cle: "zr.unit.hours", n: heures } : { cle: "zr.unit.days", n: Math.round(heures / 24) };
}

/** Le délai constaté d'un vendeur ; `null` = pas de ligne (échec de lecture compris). */
export async function delaiConstateVendeur(sellerId: string | null | undefined): Promise<DelaiConstate | null> {
  if (!sellerId || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await createAdminClient().rpc("zabelie_delai_constate", { p_seller: sellerId });
    if (error) {
      console.warn("[delai] délai constaté indisponible", error.message);
      return null;
    }
    const lu = lireDelaiConstate(data);
    if (!lu) console.warn("[delai] réponse inattendue, rien n'est affiché");
    return lu;
  } catch {
    console.warn("[delai] délai constaté indisponible");
    return null;
  }
}
