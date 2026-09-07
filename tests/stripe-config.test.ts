import test from "node:test";
import assert from "node:assert/strict";
import { isStripeEnabled } from "../lib/stripe-config";

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
