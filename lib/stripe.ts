import Stripe from "stripe";
import { siteUrl } from "./site-url";

/**
 * Client Stripe — rail carte pour la diaspora (docs/03-PAIEMENTS.md, V-10).
 *
 * ⚠️ Contexte : Stripe ne supporte pas Haïti comme pays marchand. Ce rail
 * suppose une entité US (Atlas, LLC…) côté porteur. Constructible dès
 * maintenant en mode test ; l'activation prod dépend de cette entité.
 *
 * Invariants (identiques à MonCash) :
 *   - Le montant USD est FIGÉ au checkout (payments.expected_usd_cents).
 *   - La confirmation vient du WEBHOOK signé (serveur-à-serveur), jamais du
 *     retour navigateur : /api/stripe/webhook → confirm_payment (idempotent,
 *     garde-fou p_usd_cents vérifié EN BASE).
 */

export function isStripeEnabled(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

function client(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Stripe: STRIPE_SECRET_KEY manquant.");
  return new Stripe(key);
}

export type StripeCheckoutInput = {
  orderId: string;
  usdCents: number;
  productTitle: string;
};

/**
 * Crée une session Stripe Checkout. `metadata.order_id` = notre order.id
 * (clé de rapprochement, comme l'orderId MonCash). Le montant envoyé est
 * expected_usd_cents — la vérité serveur, jamais un montant client.
 */
export async function createStripeCheckout({
  orderId,
  usdCents,
  productTitle,
}: StripeCheckoutInput): Promise<{ redirectUrl: string; sessionId: string }> {
  const site = siteUrl();
  const stripe = client();

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    client_reference_id: orderId,
    metadata: { order_id: orderId },
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: usdCents,
          product_data: { name: productTitle },
        },
      },
    ],
    // Le retour navigateur n'accorde RIEN : la confirmation vient du webhook.
    // La page « en attente » couvre le délai webhook (souvent < 2 s).
    success_url: `${site}/paiement/en-attente?commande=${orderId}`,
    cancel_url: `${site}/paiement/echec?raison=annule`,
  });

  if (!session.url) throw new Error("Stripe: session sans URL de redirection.");
  return { redirectUrl: session.url, sessionId: session.id };
}

/**
 * Vérifie la signature du webhook (INVARIANT 2 : seule la notification signée
 * fait foi). `payload` doit être le corps BRUT de la requête (req.text()).
 */
export function verifyStripeWebhook(
  payload: string,
  signature: string
): Stripe.Event {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error("Stripe: STRIPE_WEBHOOK_SECRET manquant.");
  return client().webhooks.constructEvent(payload, signature, secret);
}
