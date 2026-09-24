import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { database, loadRoute, type Query } from "./helpers/route-harness";
import { buildBriefs } from "../lib/creative/prompt-builder";
import * as studio from "../lib/creative/studio";
import type { CreativeProvider } from "../lib/creative/providers/creative";

/**
 * Studio Créatif, Phase 3 — routes (docs/62). Base, session et Higgsfield
 * sont des doublures : on vérifie l'ORDRE (inscription avant dépense), le
 * propriétaire (la session, jamais le corps) et ce qui ne part jamais.
 */

const SELLER = "11800000-0000-4000-8000-000000000001";
const OTHER = "11800000-0000-4000-8000-000000000002";
const PRODUCT = "11800000-0000-4000-8000-000000000010";
const GEN = "11800000-0000-4000-8000-0000000000f1";
const KEY = "11800000-0000-4000-8000-0000000000a1";
const PHOTO = "https://cdn.zabelie.test/p/1.jpg";
const ANCIEN = new Date(Date.now() - 60 * 60_000).toISOString();
const RECENT = new Date().toISOString();

type Opts = {
  enabled?: boolean; user?: boolean; userId?: string; owner?: string; photo?: string | null;
  insertError?: { code?: string; message?: string }; submit?: "ok" | "fail" | "throw";
  events?: Array<Record<string, unknown>>; genCreated?: string; status?: "completed" | "failed" | "generating";
};

function fixture(o: Opts = {}) {
  const order: string[] = [];
  const submitted: unknown[] = [];
  const polled: string[] = [];
  const provider: CreativeProvider = {
    name: "higgsfield",
    async submit(job) {
      order.push("submit"); submitted.push(job);
      if (o.submit === "throw") throw new Error("boom");
      return o.submit === "fail" ? { ok: false, retryable: false, error: "http_422" } : { ok: true, providerRef: "req_1" };
    },
    async status(ref) {
      polled.push(ref);
      if (o.status === "completed") return { state: "completed", imageUrl: "https://cdn.higgsfield.test/1.png" };
      if (o.status === "failed") return { state: "failed", error: "http_404" };
      return { state: "generating" };
    },
  };
  const events = [...(o.events ?? [])];
  const db = database((q: Query) => {
    const inserted = q.steps.find(([m]) => m === "insert")?.[1][0] as Record<string, unknown> | undefined;
    if (q.table === "products") return { data: { id: PRODUCT, seller_id: o.owner ?? SELLER, price_htg: 1000, cover_url: o.photo === undefined ? PHOTO : o.photo }, error: null };
    if (q.table === studio.GENERATIONS_TABLE && inserted) {
      order.push("insert_generation");
      return o.insertError ? { data: null, error: o.insertError } : { data: { id: GEN }, error: null };
    }
    if (q.table === studio.GENERATIONS_TABLE) {
      const owner = q.steps.find(([m, a]) => m === "eq" && a[0] === "seller_id")?.[1][1];
      return { data: owner === SELLER ? { id: GEN, created_at: o.genCreated ?? RECENT } : null, error: null };
    }
    if (q.table === studio.EVENTS_TABLE && inserted) {
      order.push(`event_${inserted.etat}`);
      events.push({ ...inserted, created_at: RECENT });
      return { error: null };
    }
    if (q.table === studio.EVENTS_TABLE) return { data: events, error: null };
    throw new Error(`table inattendue ${q.table}`);
  });
  const deps = {
    "@/lib/studio-server": { studioProvider: () => (o.enabled === false ? null : provider) },
    "@/lib/supabase/server": { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: o.user === false ? null : { id: o.userId ?? SELLER } } }) } }) },
    "@/lib/supabase/admin": { createAdminClient: () => db },
    "@/lib/auth": { requireActiveAccount: async () => null },
    "@/lib/api-erreur": { erreurTraduite: async (cle: string, status: number, extra?: Record<string, unknown>) => Response.json({ error: cle, ...extra }, { status }) },
    "@/lib/zabelie-rate-limit": { rateLimit: async () => true },
    "@/lib/creative/prompt-builder": { buildBriefs },
    "@/lib/creative/studio": studio,
  };
  const post = loadRoute("app/api/studio/generations/route.ts", deps).POST;
  const get = loadRoute("app/api/studio/generations/[id]/route.ts", deps).GET;
  return {
    order, submitted, polled, db, events: () => events,
    post: (body: unknown = { productId: PRODUCT, idempotencyKey: KEY, briefIndex: 1 }) =>
      post(new Request("https://z.test/api/studio/generations", { method: "POST", body: JSON.stringify(body) })),
    get: (id = GEN) => get(new Request(`https://z.test/api/studio/generations/${id}`), { params: Promise.resolve({ id }) }),
  };
}
const json = async (r: Response) => JSON.parse(JSON.stringify(await r.json()));

// ── POST ─────────────────────────────────────────────────────────────────────

test("Studio éteint : 404, aucune requête", async () => {
  const f = fixture({ enabled: false });
  assert.equal((await f.post()).status, 404);
  assert.equal((await f.get()).status, 404);
  assert.equal(f.db.queries.length, 0);
});

test("anonyme, corps invalide, produit d'un autre, produit sans photo : rien n'est inscrit ni payé", async () => {
  for (const [opts, body, status] of [
    [{ user: false }, undefined, 401],
    [{}, { productId: PRODUCT, idempotencyKey: KEY, briefIndex: 1, sellerId: OTHER }, 400],
    [{}, { productId: PRODUCT, idempotencyKey: KEY, briefIndex: 9 }, 400],
    [{ owner: OTHER }, undefined, 404],
    [{ photo: null }, undefined, 422],
    [{ photo: "http://cdn.zabelie.test/p.jpg" }, undefined, 422],
  ] as const) {
    const f = fixture(opts);
    assert.equal((await f.post(body)).status, status, JSON.stringify(opts) + JSON.stringify(body));
    assert.deepEqual(f.order, [], JSON.stringify(opts));
  }
});

test("parcours nominal : inscription AVANT la dépense, vendeur de la session, brief choisi", async () => {
  const f = fixture();
  const r = await f.post();
  assert.equal(r.status, 202);
  assert.deepEqual(await json(r), { id: GEN, state: "generating" });
  assert.deepEqual(f.order, ["insert_generation", "submit", "event_generating"]);
  const ligne = f.db.queries.find((q) => q.table === studio.GENERATIONS_TABLE)!.steps[0][1][0] as Record<string, unknown>;
  const built = buildBriefs({ id: PRODUCT, price_htg: 1000, imageUrl: PHOTO }, undefined);
  assert.ok(built.ok);
  const brief = built.briefs[1];
  assert.equal(ligne.seller_id, SELLER);
  assert.equal(ligne.prompt, brief.prompt);
  assert.equal(ligne.format, brief.format);
  assert.equal((f.submitted[0] as { referenceImageUrl: string }).referenceImageUrl, PHOTO);
});

test("clé rejouée : l'état connu est rendu, rien n'est resoumis", async () => {
  const f = fixture({ insertError: { code: "23505" }, events: [{ etat: "generating", provider_ref: "req_1", created_at: RECENT }] });
  const r = await f.post();
  assert.equal(r.status, 200);
  assert.deepEqual(await json(r), { id: GEN, state: "generating" });
  assert.deepEqual(f.order, ["insert_generation"]);
});

test("quotas : 429 nommé, aucune dépense ; autre erreur : 503, jamais un succès", async () => {
  for (const [err, status, code] of [
    [{ code: "P0001", message: "studio_quota_vendeur" }, 429, "quota_vendeur"],
    [{ code: "P0001", message: "studio_quota_global" }, 429, "quota_global"],
    [{ code: "42501", message: "permission denied" }, 503, undefined],
  ] as const) {
    const f = fixture({ insertError: err });
    const r = await f.post();
    assert.equal(r.status, status);
    assert.equal((await json(r)).code, code);
    assert.deepEqual(f.order, ["insert_generation"]);
  }
});

test("échec de soumission : événement failed inscrit, 502", async () => {
  for (const submit of ["fail", "throw"] as const) {
    const f = fixture({ submit });
    assert.equal((await f.post()).status, 502);
    assert.deepEqual(f.order, ["insert_generation", "submit", "event_failed"]);
  }
});

// ── GET ──────────────────────────────────────────────────────────────────────

test("lecture : la génération d'un autre vendeur est introuvable", async () => {
  const autre = fixture({ userId: OTHER, status: "completed", events: [{ etat: "generating", provider_ref: "req_1", created_at: RECENT }] });
  assert.equal((await autre.get()).status, 404);
  assert.deepEqual(autre.polled, []);
  const f = fixture();
  assert.equal((await f.get()).status, 200);
  const filtre = f.db.queries[0].steps.filter(([m]) => m === "eq").map(([, a]) => a[0]);
  assert.deepEqual(filtre, ["id", "seller_id"]);
  assert.equal((await fixture().get("pas-un-uuid")).status, 404);
});

test("lecture en cours : un sondage, la fin constatée est inscrite ; jamais la référence fournisseur", async () => {
  const f = fixture({ status: "completed", events: [{ etat: "generating", provider_ref: "req_1", created_at: RECENT }] });
  const body = await json(await f.get());
  assert.deepEqual(body, { id: GEN, state: "completed", imageUrl: "https://cdn.higgsfield.test/1.png" });
  assert.deepEqual(f.polled, ["req_1"]);
  assert.deepEqual(f.order, ["event_completed"]);
  assert.doesNotMatch(JSON.stringify(body), /req_1/);
});

test("délais : generating trop ancien → delai_depasse sans sonder ; requested orphelin → soumission_perdue", async () => {
  const g = fixture({ status: "completed", events: [{ etat: "generating", provider_ref: "req_1", created_at: ANCIEN }] });
  assert.deepEqual(await json(await g.get()), { id: GEN, state: "failed", detail: "delai_depasse" });
  assert.deepEqual(g.polled, []);
  const r = fixture({ genCreated: ANCIEN });
  assert.deepEqual(await json(await r.get()), { id: GEN, state: "failed", detail: "soumission_perdue" });
  const recent = fixture({ genCreated: RECENT });
  assert.deepEqual(await json(await recent.get()), { id: GEN, state: "requested" });
  assert.deepEqual(recent.order, []);
});

test("état final : rendu tel quel, Higgsfield n'est pas appelé", async () => {
  const f = fixture({ status: "failed", events: [
    { etat: "generating", provider_ref: "req_1", created_at: RECENT },
    { etat: "completed", image_url: "https://cdn.higgsfield.test/x.png", created_at: RECENT },
  ] });
  assert.deepEqual(await json(await f.get()), { id: GEN, state: "completed", imageUrl: "https://cdn.higgsfield.test/x.png" });
  assert.deepEqual(f.polled, []);
});

// ── Logique pure ─────────────────────────────────────────────────────────────

test("drapeau : seule la valeur exacte `true` allume", () => {
  for (const v of [undefined, "", "1", "TRUE", "true ", "yes"]) assert.equal(studio.studioEnabled({ ZABELIE_STUDIO_ENABLED: v }), false, String(v));
  assert.equal(studio.studioEnabled({ ZABELIE_STUDIO_ENABLED: "true" }), true);
});

test("câblage serveur : lectures d'environnement explicites, jamais NEXT_PUBLIC_", () => {
  const src = readFileSync("lib/studio-server.ts", "utf8");
  assert.match(src, /^import "server-only";/);
  for (const v of ["ZABELIE_STUDIO_ENABLED", "HF_API_KEY_ID", "HF_API_KEY_SECRET", "HF_TIMEOUT_MS"]) {
    assert.match(src, new RegExp(`${v}: process\\.env\\.${v},`), v);
  }
  assert.doesNotMatch(src, /process\.env\.NEXT_PUBLIC_/);
});
