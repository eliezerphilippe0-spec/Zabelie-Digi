import test from "node:test";
import assert from "node:assert/strict";
import { isStripeEnabled } from "../lib/stripe-config";
import { loadRoute } from "./helpers/route-harness";
import { paymentIdempotencyKey } from "../lib/payment-utils";
import type { StripeCheckoutInput } from "../lib/stripe";

test("Stripe exige une clé, un webhook et un taux utilisable avant de proposer le paiement", () => {
  const cases = [
    { key: "", webhook: "", rate: "", expected: false },
    { key: "fixture", webhook: "", rate: "132", expected: false },
    { key: "fixture", webhook: "   ", rate: "132", expected: false },
    { key: "  ", webhook: "fixture", rate: "132", expected: false },
    ...["", "0", "-1", "Infinity", "NaN"].map((rate) => ({ key: "fixture", webhook: "fixture", rate, expected: false })),
    { key: "fixture", webhook: "fixture", rate: "132", expected: true },
  ];
  const names = ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "USD_HTG_RATE"];
  const original = names.map((name) => process.env[name]);
  try {
  for (const value of cases) {
    process.env.STRIPE_SECRET_KEY = value.key;
    process.env.STRIPE_WEBHOOK_SECRET = value.webhook;
    process.env.USD_HTG_RATE = value.rate;
    assert.equal(isStripeEnabled(), value.expected, JSON.stringify(value));
  }
  } finally {
    names.forEach((name, i) => {
      if (original[i] === undefined) delete process.env[name];
      else process.env[name] = original[i];
    });
  }
});

test("Stripe réutilise une seule session opérateur par commande, même en cas de retry", async () => {
  const appels: { params: Record<string, unknown>; key?: string }[] = [];
  const sessions = new Map<string, { id: string; url: string }>();
  let creees = 0;
  class StripeDouble {
    checkout = { sessions: { create: async (params: Record<string, unknown>, options?: { idempotencyKey?: string }) => {
      appels.push({ params, key: options?.idempotencyKey });
      const key = options?.idempotencyKey ?? `sans-cle-${appels.length}`;
      if (!sessions.has(key)) {
        const id = `cs_${++creees}`;
        sessions.set(key, { id, url: `https://stripe.test/${id}` });
      }
      return sessions.get(key)!;
    } } };
  }
  const stripeClient = loadRoute("lib/stripe.ts", {
    stripe: { default: StripeDouble },
    "./site-url": { siteUrl: () => "https://zabelie.test" },
    "./stripe-config": { isStripeEnabled },
    "./payment-utils": { paymentIdempotencyKey },
  }, { STRIPE_SECRET_KEY: "sk_test_fixture" }) as unknown as {
    createStripeCheckout: (input: StripeCheckoutInput) => Promise<{ redirectUrl: string; sessionId: string }>;
  };
  const input = { orderId: "commande-1", usdCents: 3071, productTitle: "Panier" };
  const [premiere, retry] = await Promise.all([stripeClient.createStripeCheckout(input), stripeClient.createStripeCheckout(input)]);
  assert.equal(creees, 1, "le rejeu opérateur ne crée pas une seconde session payable");
  assert.equal(premiere.sessionId, retry.sessionId);
  assert.equal(premiere.redirectUrl, retry.redirectUrl);
  assert.deepEqual(appels.map((a) => a.key), ["commande-1", "commande-1"]);
  assert.equal((appels[0].params.metadata as { order_id: string }).order_id, "commande-1");
  await stripeClient.createStripeCheckout({ ...input, orderId: "commande-2" });
  assert.equal(creees, 2, "une autre commande a sa propre session");
  assert.equal(appels[2].key, "commande-2");
});
