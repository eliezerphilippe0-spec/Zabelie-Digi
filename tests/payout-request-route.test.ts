import test from "node:test";
import assert from "node:assert/strict";
import { loadRoute } from "./helpers/route-harness";
import { UUID_RE } from "../lib/collections";
import { LANGS, t, type I18nKey, type Lang } from "../lib/i18n";

const A = "11300000-0000-4000-8000-000000000041";
const B = "11300000-0000-4000-8000-000000000042";
const PAYOUT = "11300000-0000-4000-8000-000000000043";
type RpcResult = Record<string, unknown> | null;
type Options = { actor?: string | null; lang?: Lang; result?: RpcResult; error?: boolean };

/** Real POST; only verified Auth and the existing financial RPC I/O are
 * substituted. SQL guards/ledger are covered by their existing SQL tests. */
function fixture(options: Options = {}) {
  const events: string[] = [];
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const route = loadRoute("app/api/payouts/route.ts", {
    "@/lib/auth": { getCurrentUser: async () => {
      events.push("auth");
      return options.actor === null ? null : { id: options.actor ?? A };
    } },
    "@/lib/collections": { UUID_RE },
    "@/lib/api-erreur": { erreurTraduite: async (key: I18nKey, status: number) =>
      Response.json({ error: t(options.lang ?? "fr", key) }, { status }) },
    "@/lib/supabase/admin": { createAdminClient: () => {
      events.push("admin");
      return { rpc: async (name: string, args: Record<string, unknown>) => {
        events.push("rpc");
        calls.push(JSON.parse(JSON.stringify({ name, args })));
        return { data: options.result === undefined
          ? { ok: true, payout_id: PAYOUT, balance_htg: 2500, frais_ia_regles_htg: 75 }
          : options.result, error: options.error ? { message: "Synthetic RPC unavailable" } : null };
      } };
    } },
  }, {}, { console: { ...console, error() {} } });
  const sendRaw = (body: string) => route.POST(new Request("https://example.test/api/payouts", {
    method: "POST", headers: { "Content-Type": "application/json" }, body,
  }));
  return { events, calls, route, sendRaw, send: (body: unknown) => sendRaw(JSON.stringify(body)) };
}
function untouched(f: ReturnType<typeof fixture>) {
  assert.deepEqual(f.events, ["auth"]);
  assert.deepEqual(f.calls, []);
}

for (const lang of LANGS) {
  test(`payout: stale form A cannot request a withdrawal for session B (${lang})`, async () => {
    const f = fixture({ actor: B, lang });
    const response = await f.send({ amountHtg: 500, expectedActorId: A });
    assert.equal(response.status, 403, JSON.stringify({ session: B, renderedActor: A, events: f.events, calls: f.calls }));
    assert.deepEqual(await response.json(), { error: t(lang, "api.auth.required") });
    untouched(f);
  });

  test(`payout: absent or malformed form identity fails before the financial RPC (${lang})`, async () => {
    for (const expectedActorId of [undefined, null, "", "not-an-id", 12, false, [], {}, [A], ` ${A} `]) {
      const f = fixture({ lang });
      const response = await f.send({ amountHtg: 500, expectedActorId });
      assert.equal(response.status, 422, JSON.stringify({ expectedActorId, calls: f.calls }));
      assert.deepEqual(await response.json(), { error: t(lang, "api.params.invalid") });
      untouched(f);
    }
  });
}

test("payout: matching form A or B calls the existing RPC with verified session identity only", async () => {
  for (const actor of [A, B]) {
    const other = actor === A ? B : A;
    const f = fixture({ actor });
    const response = await f.send({ amountHtg: 500, expectedActorId: actor, userId: other, p_user_id: other, walletId: other });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, payoutId: PAYOUT, balanceHtg: 2500, fraisIaReglesHtg: 75 });
    assert.deepEqual(f.calls, [{ name: "zabelie_request_payout", args: { p_user_id: actor, p_amount_htg: 500 } }]);
    assert.deepEqual(f.events, ["auth", "admin", "rpc"]);
  }
});

test("payout: anonymous request is refused before reading any body or creating an admin client", async () => {
  const f = fixture({ actor: null });
  const response = await f.route.POST({ json: () => { throw new Error("Anonymous body read"); } });
  assert.equal(response.status, 401);
  untouched(f);
});

test("payout: invalid JSON and non-object bodies fail before any financial I/O", async () => {
  const malformed = fixture();
  assert.equal((await malformed.sendRaw("{")).status, 400);
  untouched(malformed);
  for (const body of [null, false, 500, "form", [], [{ amountHtg: 500, expectedActorId: A }]]) {
    const f = fixture();
    assert.equal((await f.send(body)).status, 422, JSON.stringify(body));
    untouched(f);
  }
});

test("payout: identity mismatch precedes amount validation", async () => {
  const f = fixture({ actor: B });
  assert.equal((await f.send({ expectedActorId: A, amountHtg: 0 })).status, 403);
  untouched(f);
});

test("payout: existing positive integer amount validation is preserved", async () => {
  for (const amountHtg of [undefined, null, 0, -1, 1.5, "bad"]) {
    const f = fixture();
    const response = await f.send({ expectedActorId: A, amountHtg });
    assert.equal(response.status, 422);
    assert.deepEqual(await response.json(), { error: "Montant invalide (entier positif en HTG)" });
    untouched(f);
  }
  const legacyAmount = fixture();
  assert.equal((await legacyAmount.send({ expectedActorId: A, amountHtg: "500" })).status, 200);
  assert.equal(legacyAmount.calls[0].args.p_amount_htg, 500);
});

test("payout: business refusals remain the existing RPC's responsibility", async () => {
  for (const reason of ["montant_invalide", "sous_minimum", "au_dessus_plafond", "compte_suspendu", "portefeuille_absent", "demande_en_cours", "delai_non_ecoule", "solde_insuffisant", "kyc_requis"]) {
    const f = fixture({ result: { ok: false, reason, disponible_htg: 300, frais_ia_htg: 75 } });
    const response = await f.send({ expectedActorId: A, amountHtg: 500 });
    assert.equal(response.status, 422, reason);
    const body = await response.json();
    assert.equal(body.code, reason);
    assert.equal(typeof body.error, "string");
    assert.notEqual(body.error, "Demande refusée.");
    if (reason === "solde_insuffisant") assert.match(body.error, /300 HTG, après 75 HTG de frais IA/);
    assert.deepEqual(f.calls, [{ name: "zabelie_request_payout", args: { p_user_id: A, p_amount_htg: 500 } }]);
  }
});

test("payout: existing KYC refusal messages distinguish pending, rejected and missing", async () => {
  const messages: string[] = [];
  for (const kyc_statut of ["pending", "rejected", null]) {
    const f = fixture({ result: { ok: false, reason: "kyc_requis", kyc_statut } });
    const response = await f.send({ expectedActorId: A, amountHtg: 500 });
    assert.equal(response.status, 422);
    messages.push((await response.json()).error);
  }
  assert.equal(new Set(messages).size, 3);
});

test("payout: RPC failure remains a generic error without success fields", async () => {
  const f = fixture({ error: true, result: null });
  const response = await f.send({ expectedActorId: A, amountHtg: 500 });
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: "Demande impossible" });
  assert.equal(f.calls.length, 1);
});
