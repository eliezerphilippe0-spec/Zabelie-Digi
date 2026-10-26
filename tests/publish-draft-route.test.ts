import { test } from "node:test";
import assert from "node:assert/strict";
import { t } from "../lib/i18n";
import { KIND_FILE } from "../lib/product-kind";
import { loadRoute } from "./helpers/route-harness";

const ACTOR = "00000000-0000-4000-8000-000000000001";
const OTHER = "00000000-0000-4000-8000-000000000002";
const BODY = { title: "Guide réel", kind: KIND_FILE, category: "Digital & services", priceHTG: 1000, policyAccepted: true };

function publication(authenticated = true) {
  const created: Record<string, unknown>[] = [];
  const activeAccounts: string[] = [];
  const user = authenticated ? { id: ACTOR } : null;
  const supabase = { auth: { getUser: async () => ({ data: { user } }) } };
  const route = loadRoute("app/api/products/route.ts", {
    "@/lib/i18n": { t },
    "@/lib/supabase/server": { createClient: async () => supabase },
    "@/lib/auth": { requireActiveAccount: async (id: string) => { activeAccounts.push(id); return null; } },
    "@/lib/product-draft": { creerBrouillonProduit: async (args: Record<string, unknown>) => {
      created.push(args);
      return { id: "product-created", slug: "guide-reel-12345", status: "draft" };
    } },
    "@/lib/metrics": { logSellerFunnel: () => {} },
  });
  return {
    created, activeAccounts, user, supabase,
    send: (body: Record<string, unknown>) => route.POST(new Request("https://zabelie.test/api/products", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    })),
  };
}

test("product creation refuses an old form account before calling the creation helper", async () => {
  for (const expectedActorId of [OTHER, "", null, false, 123, {}]) {
    const f = publication();
    const response = await f.send({ ...BODY, expectedActorId });
    assert.equal(response.status, 403, `expected identity ${JSON.stringify(expectedActorId)}`);
    assert.equal(f.created.length, 0, "no policy acceptance or product INSERT can start under the new account");
  }
});

test("matching form identity preserves the existing session-bound creation flow", async () => {
  const f = publication();
  const body = { ...BODY, expectedActorId: ACTOR };
  const response = await f.send(body);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { slug: "guide-reel-12345", status: "draft" });
  assert.deepEqual(f.activeAccounts, [ACTOR]);
  assert.equal(f.created.length, 1);
  assert.equal(f.created[0].user, f.user);
  assert.equal(f.created[0].supabase, f.supabase);
  assert.deepEqual(f.created[0].body, body);
});

test("historical clients omitting the optional expected identity can still create under their session", async () => {
  const f = publication();
  const response = await f.send(BODY);
  assert.equal(response.status, 200);
  assert.equal(f.created.length, 1);
  assert.equal(f.created[0].user, f.user);
  assert.deepEqual(f.created[0].body, BODY);
});

test("an unauthenticated request never reaches account checks or product creation", async () => {
  const f = publication(false);
  const response = await f.send({ ...BODY, expectedActorId: ACTOR });
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: t("fr", "api.auth.required") });
  assert.deepEqual(f.activeAccounts, []);
  assert.equal(f.created.length, 0);
});
