import test from "node:test";
import assert from "node:assert/strict";
import {
  isSuccessful,
  redactPayment,
  normalizePayment,
  type MonCashPayment,
} from "../lib/moncash";
import {
  slugify,
  paymentIdempotencyKey,
  persistPaymentSession,
  walletCreditKey,
  amountMatches,
  withinRailCap,
  railCap,
  railCountry,
  usdCentsFromHtg,
  formatUsd,
  zelleMemo,
} from "../lib/payment-utils";
import type { SupabaseClient } from "@supabase/supabase-js";
import { database } from "./helpers/route-harness";

test("isSuccessful : true uniquement si statut 'successful'", () => {
  const base: Omit<MonCashPayment, "status"> = {
    reference: "o1",
    transactionId: "t1",
    cost: 100,
    message: "ok",
    payer: "509",
  };
  assert.equal(isSuccessful({ ...base, status: "successful" }), true);
  assert.equal(isSuccessful({ ...base, status: "pending" }), false);
  assert.equal(isSuccessful({ ...base, status: "failed" }), false);
  assert.equal(isSuccessful(null), false);
});

test("redactPayment : retire l'identifiant du payeur (minimisation RGPD)", () => {
  const p: MonCashPayment = {
    reference: "o1",
    transactionId: "t1",
    cost: 100,
    message: "ok",
    payer: "50912345678",
    status: "successful",
  };
  const r = redactPayment(p);
  assert.equal("payer" in r, false); // plus d'identifiant payeur
  assert.equal(r.payer_present, true); // trace de présence seulement
  assert.equal(r.transactionId, "t1"); // audit/réconciliation préservés
  assert.equal(r.cost, 100);
  assert.equal(r.status, "successful");
});

test("normalizePayment : format réel MonCash (snake_case + succès par message)", () => {
  // Réponse type MonCash : transaction_id, cost string, succès via message.
  const p = normalizePayment({
    reference: "order-1",
    transaction_id: "TX-123",
    cost: "2500",
    message: "successful",
    payer: "50937000000",
  });
  assert.equal(p?.transactionId, "TX-123");
  assert.equal(p?.cost, 2500);
  assert.equal(p?.status, "successful");
  assert.equal(isSuccessful(p), true);

  // Statut explicite alternatif (payment_status).
  assert.equal(
    isSuccessful(normalizePayment({ payment_status: "successful" })),
    true
  );
  // Non abouti.
  assert.equal(isSuccessful(normalizePayment({ message: "pending" })), false);
  assert.equal(normalizePayment(null), null);
});

test("paymentIdempotencyKey : stable = order.id", () => {
  assert.equal(paymentIdempotencyKey("abc"), "abc");
  // Idempotent : même entrée → même clé (pas de doublon de paiement).
  assert.equal(paymentIdempotencyKey("abc"), paymentIdempotencyKey("abc"));
});

test("persistPaymentSession : écrit la référence sur la commande attendue avant de réussir", async () => {
  const raw = { stripe_session_id: "cs_1" };
  const db = database(() => ({ data: { order_id: "o1" }, error: null }));
  await persistPaymentSession(db as unknown as SupabaseClient, "o1", raw);
  assert.equal(db.queries.length, 1);
  assert.equal(db.queries[0].table, "payments");
  assert.deepEqual(db.queries[0].steps.find(([m]) => m === "update")?.[1], [{ raw }]);
  assert.deepEqual(db.queries[0].steps.find(([m]) => m === "eq")?.[1], ["order_id", "o1"]);
});

test("persistPaymentSession : refuse erreur DB, absence, mauvaise commande et exception", async () => {
  for (const result of [
    { data: null, error: { message: "base indisponible" } },
    { data: null, error: null },
    { data: { order_id: "autre" }, error: null },
  ]) {
    const db = database(() => result);
    await assert.rejects(persistPaymentSession(db as unknown as SupabaseClient, "o1", { stripe_session_id: "cs_1" }));
  }
  const exception = database(() => { throw new Error("connexion coupée"); });
  await assert.rejects(persistPaymentSession(exception as unknown as SupabaseClient, "o1", { stripe_session_id: "cs_1" }));
});

test("walletCreditKey : format aligné sur confirm_payment (SQL)", () => {
  // confirm_payment utilise 'order_credit:' || order_id. Doit correspondre.
  assert.equal(walletCreditKey("xyz"), "order_credit:xyz");
});

test("amountMatches : rejette un montant falsifié (money-path)", () => {
  assert.equal(amountMatches(2500, 2500), true);
  assert.equal(amountMatches(2500, 2500.0), true);
  assert.equal(amountMatches(2500, 2499), false); // montant minoré
  assert.equal(amountMatches(2500, 5000), false); // montant majoré
  assert.equal(amountMatches(2500, Number.NaN), false);
});

test("plafonds : MonCash 25k, NatCash 20k", () => {
  assert.equal(railCap("moncash"), 25000);
  assert.equal(railCap("natcash"), 20000);
  assert.equal(railCap("inconnu"), null);

  assert.equal(withinRailCap(25000, "moncash"), true); // pile au plafond = ok
  assert.equal(withinRailCap(25001, "moncash"), false);
  assert.equal(withinRailCap(20001, "natcash"), false);
  // Rail inconnu → pas de plafond appliqué (true).
  assert.equal(withinRailCap(999999, "inconnu"), true);
});

test("railCountry : rails haïtiens → HT, inconnu → null", () => {
  assert.equal(railCountry("moncash"), "HT");
  assert.equal(railCountry("natcash"), "HT");
  assert.equal(railCountry("inconnu"), null);
});

test("usdCentsFromHtg : conversion figée au checkout (rails diaspora)", () => {
  // 2500 HTG à 125 HTG/USD = 20 USD = 2000 cents.
  assert.equal(usdCentsFromHtg(2500, 125), 2000);
  // Arrondi au cent le plus proche (jamais de float stocké).
  assert.equal(usdCentsFromHtg(1000, 132), 758); // 757.57… → 758
  assert.equal(Number.isInteger(usdCentsFromHtg(1234, 131)), true);
  // Taux invalide → erreur claire (rail refusé au checkout).
  assert.throws(() => usdCentsFromHtg(1000, 0));
  assert.throws(() => usdCentsFromHtg(1000, -5));
  assert.throws(() => usdCentsFromHtg(1000, Number.NaN));
});

test("formatUsd : affichage en dollars", () => {
  assert.equal(formatUsd(2000), "$20.00");
  assert.equal(formatUsd(758), "$7.58");
  assert.equal(formatUsd(0), "$0.00");
});

test("zelleMemo : code stable, court, dérivé de la commande", () => {
  const memo = zelleMemo("a1b2c3d4-e5f6-7890-abcd-ef1234567890");
  assert.equal(memo, "ZD-A1B2C3D4");
  // Stable au rejeu (rapprochement manuel fiable).
  assert.equal(
    zelleMemo("a1b2c3d4-e5f6-7890-abcd-ef1234567890"),
    memo
  );
});

test("slugify : URL propre, accents retirés, borné", () => {
  assert.equal(slugify("Beat Kompa Moderne"), "beat-kompa-moderne");
  assert.equal(slugify("  Préséts Lightroom!! "), "presets-lightroom");
  assert.equal(slugify("a".repeat(80)).length, 60);
});
