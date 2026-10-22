import test from "node:test";
import assert from "node:assert/strict";
import { loadRoute } from "./helpers/route-harness";

const disputeTypes = ["created", "updated", "closed", "funds_withdrawn", "funds_reinstated"];
function fixture(options: {
  type?: string; dispute?: Record<string, unknown>; event?: Record<string, unknown>;
  result?: unknown; rpcError?: boolean; rpcThrows?: boolean; configThrows?: boolean; signatureError?: boolean;
} = {}) {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const verified: string[][] = [];
  let clients = 0;
  const event = { id: "evt_dispute", type: options.type ?? "charge.dispute.created", livemode: false,
    data: { object: { id: "du_1MtJUT2eZvKYlo2CNaw2HvEv", payment_intent: "pi_payment", charge: "ch_charge", status: "needs_response",
      amount: 1250, currency: "usd", metadata: { order_id: "untrusted-order" }, evidence: { customer_name: "not persisted" }, ...options.dispute } },
    ...options.event };
  const route = loadRoute("app/api/stripe/webhook/route.ts", {
    "@/lib/api-erreur": { erreurTraduite: async (key: string, status: number) => Response.json({ error: key }, { status }) },
    "@/lib/stripe": { verifyStripeWebhook: (payload: string, signature: string) => {
      verified.push([payload, signature]);
      if (options.signatureError) throw Error("bad signature");
      return event;
    } },
    "@/lib/supabase/admin": { createAdminClient: () => {
      clients++;
      if (options.configThrows) throw Error("missing configuration");
      return { from: () => { throw Error("disputes must use the atomic RPC only"); },
        rpc: async (name: string, args: Record<string, unknown>) => {
          calls.push({ name, args: JSON.parse(JSON.stringify(args)) });
          if (options.rpcThrows) throw Error("lost response");
          return { data: options.result === undefined ? { ok: true, event_id: event.id, reason: "recorded", duplicate: false } : options.result,
            error: options.rpcError ? { message: "private database error" } : null };
        } };
    } },
    "@/lib/fulfillment": { ouvrirSuiviLivraison: () => { throw Error("no fulfillment for disputes"); } },
    "@/lib/zabelie-notify": { notifyOrderPaid: () => { throw Error("no paid notification for disputes"); } },
    "@/lib/webhooks-apres": { repartirApresReponse: () => { throw Error("no paid webhook for disputes"); } },
  });
  return { calls, verified, clients: () => clients, post: (signature = true) => route.POST(new Request("https://example.test/api/stripe/webhook", {
    method: "POST", headers: signature ? { "stripe-signature": "signed-fixture" } : {}, body: "{ \"raw\": true }\n",
  })) };
}

for (const type of disputeTypes) {
  test("signed charge.dispute." + type + " uses only the dispute receipt RPC", async () => {
    const f = fixture({ type: "charge.dispute." + type });
    assert.equal((await f.post()).status, 200);
    assert.deepEqual(f.verified, [["{ \"raw\": true }\n", "signed-fixture"]]);
    assert.deepEqual(f.calls, [{ name: "zabelie_record_stripe_dispute", args: {
      p_event_id: "evt_dispute", p_event_type: "charge.dispute." + type, p_dispute_id: "du_1MtJUT2eZvKYlo2CNaw2HvEv",
      p_payment_intent_id: "pi_payment", p_charge_id: "ch_charge", p_status: "needs_response",
      p_amount_usd_cents: 1250, p_currency: "usd", p_livemode: false,
    } }]);
  });
}

test("expanded provider objects are normalized, without trusting order metadata or retaining evidence", async () => {
  const f = fixture({ dispute: { payment_intent: { id: "pi_expanded" }, charge: { id: "ch_expanded" } } });
  assert.equal((await f.post()).status, 200);
  assert.equal(f.calls[0].args.p_payment_intent_id, "pi_expanded");
  assert.equal(f.calls[0].args.p_charge_id, "ch_expanded");
  assert.equal(Object.keys(f.calls[0].args).length, 9);
});

test("a legacy dispute without a PaymentIntent is durably submitted for retryable review", async () => {
  const f = fixture({ dispute: { payment_intent: null }, result: { ok: false, retryable: true, event_id: "evt_dispute", reason: "payment_unmatched" } });
  assert.equal((await f.post()).status, 503);
  assert.equal(f.calls[0].args.p_payment_intent_id, null);
});

test("non-USD signed disputes reach the receipt RPC instead of silently disappearing", async () => {
  const f = fixture({ dispute: { currency: "eur" }, result: { ok: false, retryable: true, event_id: "evt_dispute", reason: "currency_incompatible" } });
  assert.equal((await f.post()).status, 503);
  assert.equal(f.calls[0].args.p_currency, "eur");
});

test("missing or invalid signatures never create a database client", async () => {
  const missing = fixture();
  assert.equal((await missing.post(false)).status, 400);
  assert.equal(missing.clients(), 0);
  assert.equal(missing.verified.length, 0);
  const invalid = fixture({ signatureError: true });
  assert.equal((await invalid.post()).status, 400);
  assert.equal(invalid.clients(), 0);
});

test("invalid provider identifiers, amounts and shapes cannot reach the database", async () => {
  for (const dispute of [{ id: "other" }, { payment_intent: "cs_wrong" }, { payment_intent: {} }, { charge: null },
    { amount: -1 }, { amount: 0 }, { amount: 1.5 }, { amount: Number.MAX_SAFE_INTEGER + 1 },
    { currency: "US dollars" }, { status: "" }, { status: undefined }]) {
    const f = fixture({ dispute });
    assert.equal((await f.post()).status, 400, JSON.stringify(dispute));
    assert.equal(f.clients(), 0);
  }
  for (const event of [{ id: "invalid" }, { livemode: undefined }, { data: { object: null } }]) {
    const f = fixture({ event });
    assert.equal((await f.post()).status, 400);
    assert.equal(f.clients(), 0);
  }
});

test("duplicate receipts acknowledge safely; unresolved mapping and payload conflicts do not acknowledge", async () => {
  const duplicate = fixture({ result: { ok: true, event_id: "evt_dispute", duplicate: true, reason: "recorded" } });
  assert.deepEqual(await (await duplicate.post()).json(), { received: true, status: "recorded", duplicate: true });
  for (const reason of ["payment_unmatched", "payment_ambiguous", "payment_not_confirmed", "livemode_incompatible", "escrow_unavailable"]) {
    const f = fixture({ result: { ok: false, retryable: true, reason, event_id: "evt_dispute" } });
    assert.equal((await f.post()).status, 503, reason);
    assert.equal(f.calls.length, 1);
  }
  const conflict = fixture({ result: { ok: false, retryable: false, reason: "event_payload_conflict", event_id: "evt_dispute" } });
  assert.equal((await conflict.post()).status, 409);
});

test("lost, malformed or unavailable RPC responses remain retryable and expose no private errors", async () => {
  for (const options of [{ rpcError: true }, { rpcThrows: true }, { configThrows: true }, { result: null }, { result: {} },
    { result: { ok: true, event_id: "evt_different" } }]) {
    const f = fixture(options);
    const response = await f.post();
    assert.equal(response.status, 503, JSON.stringify(options));
    assert.equal((await response.text()).includes("private database error"), false);
  }
});

test("unknown dispute types remain ignored rather than using an unrecognized contract", async () => {
  const f = fixture({ type: "charge.dispute.future" });
  assert.equal((await f.post()).status, 200);
  assert.equal(f.clients(), 0);
});
