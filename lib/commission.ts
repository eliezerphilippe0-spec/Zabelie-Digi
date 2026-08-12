/**
 * Commission par tier — ORACLE + estimation d'affichage.
 *
 * ⚠️ Ce module NE calcule PAS l'argent réellement crédité. La SEULE source de
 * vérité qui écrit de l'argent est la SQL, au moment du paiement.
 *
 * Ce miroir TS a deux usages, et un seul consommateur applicatif :
 *   - oracle de test (`tests/commission.test.ts`) ;
 *   - **estimation** affichée au vendeur sous le champ prix
 *     (`components/net-estimate.tsx`).
 *
 * Ce consommateur est délibéré : un oracle dont le seul importateur est sa
 * propre suite de tests diverge en SILENCE — il se vérifie contre lui-même et
 * rien à l'écran ne le contredit jamais. Branché sur un chemin réel, un écart
 * avec la SQL devient visible par un vendeur. `tests/commission-consumer.test.ts`
 * empêche le retour à l'état « oracle sans consommateur ».
 *
 * Corollaire, appris en le cassant : dès lors que ce module alimente un
 * chiffre montré à un vendeur, il doit refléter la règle **déployée**, pas la
 * règle souhaitée. Voir `ROUNDING_IN_FORCE`.
 *
 * Le net affiché APRÈS la vente (`lib/zabelie-notify.ts`) est relu du grand
 * livre, jamais recalculé ici.
 */

export type CreatorTier = "standard" | "elite";

/**
 * Taux en points de base (1000 = 10 %, 600 = 6 %).
 *
 * ⚠️ DEPUIS `0054`/`0066`, CE N'EST PLUS LA SOURCE — C'EST LE REPLI. Les taux
 * vivent en table de configuration ; `lib/commission-config.ts` les lit et les
 * passe à l'écran. Ces constantes ne servent plus que lorsque la lecture
 * échoue, et elles doivent alors rendre exactement ce que rend le `coalesce`
 * de `commission_rate_bps` en base — sans quoi une dégradation ferait diverger
 * l'estimation affichée du net réellement crédité.
 * `tests/commission-config.test.ts` croise les deux et échoue s'ils s'écartent.
 */
export const RATE_BPS: Record<CreatorTier, number> = {
  standard: 1000,
  elite: 600,
};

export function rateBps(tier: CreatorTier): number {
  return RATE_BPS[tier] ?? RATE_BPS.standard;
}

export type RoundingRule = "round" | "floor";

/**
 * Sens de l'arrondi **RÉELLEMENT EN VIGUEUR EN PRODUCTION**.
 *
 * `round` aujourd'hui : c'est ce que fait `confirm_payment` en base. La
 * migration `0044` (arrondi au vendeur, `floor`) est **écrite et non
 * appliquée**, et la décision commerciale elle-même attend l'arbitrage du
 * porteur (`docs/02`, D-4).
 *
 * ⚠️ Cette constante et l'état de la base ne font qu'un, et **l'ordre de la
 * bascule n'est pas neutre** :
 *   1. appliquer `0044` en base ;
 *   2. passer cette constante à `"floor"` ;
 *   3. redéployer.
 * Dans cet ordre, l'intervalle donne au vendeur PLUS que ce qui lui est
 * annoncé — sens sûr. Dans l'autre, il lui promet une gourde qu'on ne verse
 * pas : une estimation fausse dans un sens connu est pire qu'une absence
 * d'estimation, parce qu'elle a l'air d'un engagement.
 *
 * ⚠️ Miroir réglé à la MAIN : il dit vrai tant que quelqu'un y pense.
 * `lib/rounding-probe.ts` le confronte au journal des migrations à chaque
 * contrôle de cohérence, et le relevé de la première commande (`docs/22`)
 * ferme la boucle en comparant l'affiché au crédité.
 */
/**
 * D-4 tranchée par le porteur le 2026-08-03 : **`floor`**, l'arrondi va au
 * VENDEUR. Basculée en même temps que `0044` est appliquée en base.
 *
 * ⚠️ CETTE LIGNE MENT SI `0044` N'EST PAS APPLIQUÉE. Elle décrit ce que la
 * BASE fait, pas ce qu'on souhaite — c'est tout l'objet du miroir. La sonde
 * de `/api/admin/coherence` le dira, mais l'ordre des gestes est la vraie
 * protection : base d'abord, écran ensuite. Dans cet ordre l'intervalle donne
 * au vendeur PLUS que ce qui lui est annoncé ; dans l'autre on lui promet une
 * gourde qu'on ne verse pas.
 */
export const ROUNDING_IN_FORCE: RoundingRule = "floor";

/**
 * Commission prélevée par la plateforme (HTG entiers).
 *
 * Le paramètre `rule` existe pour que les tests exercent RÉELLEMENT les deux
 * règles — sans lui, la branche non déployée ne serait jamais parcourue et on
 * découvrirait ses écarts le jour de la bascule.
 *
 * ⚠️ ORACLE et ESTIMATION, jamais une seconde source de vérité.
 */
export function commissionHTG(
  grossHTG: number,
  tier: CreatorTier,
  rule: RoundingRule = ROUNDING_IN_FORCE,
): number {
  return commissionAuTaux(grossHTG, rateBps(tier), rule);
}

/**
 * La même règle, à un taux EXPLICITE.
 *
 * C'est par ici que passe l'affichage depuis `0066` : l'écran reçoit le taux
 * réellement configuré en base plutôt que la constante compilée. La formule
 * est partagée avec `commissionHTG` — une seconde copie de l'arrondi serait
 * exactement le genre de divergence que ce module existe pour éviter.
 */
export function commissionAuTaux(
  grossHTG: number,
  bps: number,
  rule: RoundingRule = ROUNDING_IN_FORCE,
): number {
  const exact = (grossHTG * bps) / 10000;
  return rule === "floor" ? Math.floor(exact) : Math.round(exact);
}

/** Montant net crédité au vendeur (HTG). */
export function netHTG(
  grossHTG: number,
  tier: CreatorTier,
  rule: RoundingRule = ROUNDING_IN_FORCE,
): number {
  return grossHTG - commissionHTG(grossHTG, tier, rule);
}
