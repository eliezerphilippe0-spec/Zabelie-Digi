/** Même disponibilité côté affichage et checkout. Lecture serveur uniquement.
 * Sans secret de webhook, un paiement pourrait être encaissé sans confirmation.
 */
export function isStripeEnabled(): boolean {
  const rate = Number(process.env.USD_HTG_RATE);
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim())
    && Boolean(process.env.STRIPE_WEBHOOK_SECRET?.trim())
    && Number.isFinite(rate) && rate > 0;
}
