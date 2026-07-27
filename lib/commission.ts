/**
 * Commission par tier — ORACLE.
 *
 * ⚠️ Ce module NE calcule PAS l'argent réellement crédité. La SEULE source de
 * vérité qui écrit de l'argent est la fonction SQL `confirm_payment`
 * (supabase/migrations/0005_commission.sql). Ce miroir TS sert uniquement :
 *   - d'oracle de test (vérifier que la formule SQL est correcte),
 *   - d'affichage (estimer net/commission dans l'UI).
 * La formule DOIT rester identique à celle du SQL : commission =
 * round(gross * rate_bps / 10000), net = gross - commission.
 */

export type CreatorTier = "standard" | "elite";

/** Taux en points de base (1000 = 10 %, 600 = 6 %). */
export const RATE_BPS: Record<CreatorTier, number> = {
  standard: 1000,
  elite: 600,
};

export function rateBps(tier: CreatorTier): number {
  return RATE_BPS[tier] ?? RATE_BPS.standard;
}

/**
 * Commission prélevée par la plateforme (HTG entiers).
 *
 * `floor` et non `round` — décision D-4 : l'arrondi va au VENDEUR. `round`
 * envoyait systématiquement la fraction à la plateforme (25 HTG → 3 au lieu
 * de 2,5), ce qui n'avait jamais été décidé : c'était le défaut hérité de
 * PostgreSQL. Coût maximal 1 gourde par vente.
 *
 * ⚠️ ORACLE, jamais une seconde source de vérité : la SQL calcule
 * (`zabelie_commission_htg`, migration 0044), ceci sert aux tests et à
 * l'affichage. Les deux doivent rester d'accord — c'est ce que vérifie
 * `tests/commission.test.ts`.
 */
export function commissionHTG(grossHTG: number, tier: CreatorTier): number {
  return Math.floor((grossHTG * rateBps(tier)) / 10000);
}

/** Montant net crédité au vendeur (HTG). */
export function netHTG(grossHTG: number, tier: CreatorTier): number {
  return grossHTG - commissionHTG(grossHTG, tier);
}
