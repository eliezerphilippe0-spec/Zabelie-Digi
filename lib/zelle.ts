/**
 * Rail Zelle — diaspora USD, flux SEMI-MANUEL professionnel (V-10).
 *
 * Zelle n'a pas d'API publique : la plateforme affiche les instructions
 * (destinataire + mémo dérivé de la commande, lib/payment-utils.ts::zelleMemo),
 * l'acheteur envoie le virement, puis un ADMIN confirme après vérification du
 * relevé bancaire. La confirmation passe par le MÊME confirm_payment idempotent
 * que MonCash/Stripe (garde-fou expected_usd_cents vérifié en base) : aucune
 * livraison sans confirmation explicite, rejeu sans double crédit.
 */

export type ZelleRecipient = {
  /** E-mail ou téléphone US enrôlé Zelle. */
  handle: string;
  /** Nom du titulaire tel qu'affiché par la banque (rassure l'acheteur). */
  name: string;
};

export function isZelleEnabled(): boolean {
  return Boolean(process.env.ZELLE_RECIPIENT);
}

export function zelleRecipient(): ZelleRecipient {
  const handle = process.env.ZELLE_RECIPIENT;
  if (!handle) throw new Error("Zelle: ZELLE_RECIPIENT manquant.");
  return { handle, name: process.env.ZELLE_RECIPIENT_NAME ?? "Zabelie" };
}
