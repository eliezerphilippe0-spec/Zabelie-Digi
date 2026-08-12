import type { SupabaseClient } from "@supabase/supabase-js";
import { RATE_BPS, type CreatorTier } from "./commission";

/**
 * LE TAUX RÉELLEMENT CONFIGURÉ, lu en base pour l'affichage.
 *
 * Pourquoi ce fichier est SÉPARÉ de `lib/commission.ts` : celui-ci est importé
 * par `components/net-estimate.tsx`, un composant client. Y ajouter un import
 * Supabase ferait entrer le SDK dans le bundle du navigateur pour rien. La
 * frontière est donc nette — `commission.ts` reste pur et isomorphe, la
 * lecture vit ici, côté serveur uniquement.
 *
 * ─── CE QUE CE MODULE FERME ─────────────────────────────────────────────────
 * `0054` déplace les taux en table de configuration en gardant la signature de
 * `commission_rate_bps` : le chemin d'ARGENT suit tout seul. L'ÉCRAN, lui, ne
 * suivait pas — `RATE_BPS` est une constante compilée. Un `UPDATE` du taux en
 * base sans redéploiement affichait donc au vendeur un net qu'il ne toucherait
 * pas, et une estimation fausse a l'air d'un engagement.
 *
 * ⚠️ CE QUE CE MODULE NE FAIT PAS. Il ne calcule aucun argent. Le seul
 * calculateur reste la SQL au moment du paiement. Ici on lit un taux pour
 * l'afficher, rien d'autre.
 */

/** Nom de la RPC créée par `0066`. Adressée par CHAÎNE : voir le test croisé. */
export const RPC_TAUX = "zabelie_commission_taux";

export type TauxCommission = Record<CreatorTier, number>;

/**
 * Rend les taux en vigueur, ou le repli historique.
 *
 * ─── LE REPLI EST DÉLIBÉRÉ, ET IL EST LE MÊME QUE CELUI DE LA SQL ───────────
 * `0054` fait exactement ça côté base : `coalesce((select rate_bps …), case
 * p_tier when 'elite' then 600 else 1000 end)`. Les deux replis doivent rendre
 * les MÊMES valeurs, sans quoi une dégradation ferait diverger l'écran du
 * grand livre — précisément le défaut qu'on est en train de fermer.
 * `tests/commission-config.test.ts` croise les deux et échoue s'ils s'écartent.
 *
 * Fail-open assumé : une lecture de configuration en échec ne doit pas
 * empêcher un vendeur de saisir un prix. Le pire cas est une estimation
 * affichée aux taux historiques — ceux qui sont en vigueur depuis l'origine.
 */
export async function lireTauxCommission(
  client: SupabaseClient,
  journal: (contexte: Record<string, unknown>) => void = () => {},
): Promise<{ taux: TauxCommission; source: "config" | "repli" }> {
  try {
    const { data, error } = await client.rpc(RPC_TAUX);
    if (error || !Array.isArray(data) || data.length === 0) {
      // Journalisé MÊME quand c'est attendu (0054/0066 non appliquées) :
      // sans ça, « la config est absente » et « la config dit la même chose
      // que le repli » produisent le même silence.
      journal({ taux: "repli", motif: error?.message ?? "reponse vide" });
      return { taux: { ...RATE_BPS }, source: "repli" };
    }
    const lus = { ...RATE_BPS };
    for (const ligne of data as { tier?: string; rate_bps?: number }[]) {
      if ((ligne.tier === "standard" || ligne.tier === "elite") &&
          Number.isInteger(ligne.rate_bps)) {
        lus[ligne.tier] = ligne.rate_bps as number;
      }
    }
    return { taux: lus, source: "config" };
  } catch (e) {
    journal({ taux: "repli", motif: e instanceof Error ? e.message : "inconnu" });
    return { taux: { ...RATE_BPS }, source: "repli" };
  }
}
