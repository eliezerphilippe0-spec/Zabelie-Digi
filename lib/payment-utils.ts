/**
 * Fonctions pures liées au paiement et au catalogue. Sans dépendance runtime,
 * donc testables unitairement (voir tests/payment.test.ts).
 */

/** Slug URL à partir d'un titre. */
export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
}

/**
 * Clé d'idempotence du paiement = order.id. Un seul paiement par commande.
 * (Doit correspondre à l'usage dans /api/checkout et confirm_payment.)
 */
export function paymentIdempotencyKey(orderId: string): string {
  return orderId;
}

/**
 * Clé d'idempotence du crédit wallet. DOIT être identique à celle utilisée par
 * la fonction SQL confirm_payment ('order_credit:' || order_id), sinon le crédit
 * pourrait être appliqué deux fois.
 */
export function walletCreditKey(orderId: string): string {
  return `order_credit:${orderId}`;
}

/**
 * Le montant rapporté par l'opérateur correspond-il au montant de la commande ?
 * Garde-fou contre un montant falsifié/incohérent (INVARIANT money-path).
 * Le contrôle de vérité est aussi appliqué côté base dans confirm_payment.
 */
export function amountMatches(
  orderAmountHTG: number,
  operatorCost: number
): boolean {
  return Number.isFinite(operatorCost) && orderAmountHTG === Math.round(operatorCost);
}

/**
 * Plafonds par transaction et par rail (HTG). Au-delà, l'opérateur refuse :
 * on bloque AVANT de créer la commande, avec un message clair.
 * NatCash défini pour plus tard (Vague 2, bloqué).
 */
export const RAIL_CAPS: Record<string, number> = {
  moncash: 25000,
  natcash: 20000,
  /* `kobara` route vers NatCash OU MonCash selon le `provider` choisi. Le
   * plafond retenu ici est le plus BAS des deux, parce qu'un plafond de rail
   * est franchi avant que le provider soit connu du contrôle. Le plafond
   * exact du provider est vérifié ensuite dans le checkout
   * (`lib/kobara.ts::kobaraCap`) — les deux contrôles ne font pas double
   * emploi : celui-ci protège l'ordre des opérations, l'autre la précision. */
  kobara: 20000,
};

export function railCap(rail: string): number | null {
  return RAIL_CAPS[rail] ?? null;
}

/** Le montant respecte-t-il le plafond du rail ? (true si pas de plafond connu) */
export function withinRailCap(amountHTG: number, rail: string): boolean {
  const cap = railCap(rail);
  return cap === null ? true : amountHTG <= cap;
}

/**
 * Pays implicite d'un rail de paiement (ISO-3166 alpha-2). MonCash et NatCash
 * sont des mobile money HAÏTIENS : payer via ce rail implique un compte en Haïti.
 * Sert au backfill best-effort de profiles.country_code (dashboard /admin/geo) —
 * jamais d'écrasement d'un pays déjà renseigné par l'utilisateur.
 */
export const RAIL_COUNTRY: Record<string, string> = {
  moncash: "HT",
  natcash: "HT",
  // Kobara n'encaisse que du mobile money haïtien : le signal de pays est
  // aussi fort que pour MonCash en direct.
  kobara: "HT",
};

export function railCountry(rail: string): string | null {
  return RAIL_COUNTRY[rail] ?? null;
}

/**
 * Conversion HTG → cents USD pour les rails diaspora (Stripe/Zelle).
 * `htgPerUsd` = taux configuré (env USD_HTG_RATE, ex. 132 HTG pour 1 USD).
 * Le montant USD est FIGÉ au checkout (payments.expected_usd_cents) puis
 * vérifié en base par confirm_payment — même invariant que MonCash.
 */
export function usdCentsFromHtg(amountHtg: number, htgPerUsd: number): number {
  if (!Number.isFinite(htgPerUsd) || htgPerUsd <= 0) {
    throw new Error("Taux USD_HTG_RATE invalide");
  }
  return Math.round((amountHtg * 100) / htgPerUsd);
}

export function formatUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/** Code mémo Zelle lisible, dérivé de la commande (rapprochement manuel). */
export function zelleMemo(orderId: string): string {
  return `ZD-${orderId.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}
