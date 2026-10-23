import { test } from "node:test";
import assert from "node:assert/strict";
import { database, loadRoute } from "./helpers/route-harness";
import { t, type Lang } from "../lib/i18n";
import * as kinds from "../lib/product-kind";
import { UUID_RE } from "../lib/collections";

const PRODUCT = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const ACTOR = "33333333-3333-4333-8333-333333333333";
const MISSING = "44444444-4444-4444-8444-444444444444";
const STATUSES = ["draft", "published", "archived"] as const;
type Options = {
  lang?: Lang; role?: "admin" | "buyer" | null;
  kind?: "physical" | "service" | "fichier";
  disappear?: boolean; updateError?: string;
  assets?: number; assetsError?: boolean; clean?: boolean;
};

/** Double PostgREST : zéro ligne n'est pas une erreur ; seules les lignes
 * effectivement modifiées sont renvoyées si l'appelant demande un SELECT.
 * Aucune décision HTTP ou garde du correctif n'est implémentée ici. */
function fixture(o: Options = {}) {
  const lang = o.lang ?? "fr";
  const rows = new Map([
    [PRODUCT, { id: PRODUCT, kind: o.kind ?? "physical", status: "draft" }],
    [OTHER, { id: OTHER, kind: "physical", status: "published" }],
  ]);
  const audits: unknown[] = [];
  let clients = 0;
  let scans = 0;
  const db = database(({ table, steps }) => {
    if (table === "product_assets") return {
      count: o.assets ?? 1, data: null,
      error: o.assetsError ? { code: "08006", message: "private database error" } : null,
    };
    assert.equal(table, "products");
    const id = steps.find(([method, args]) => method === "eq" && args[0] === "id")?.[1][1] as string;
    const update = steps.find(([method]) => method === "update");
    if (!update) return { data: rows.has(id) ? { kind: rows.get(id)!.kind } : null, error: null };
    if (o.disappear) rows.delete(id);
    if (o.updateError) return { data: null, error: { code: o.updateError, message: "private database error" } };
    const row = rows.get(id);
    if (row) row.status = (update[1][0] as { status: string }).status;
    const returning = steps.some(([method]) => method === "select");
    return { data: returning && row ? { id: row.id } : null, error: null };
  });
  const route = loadRoute("app/api/admin/product-status/route.ts", {
    "@/lib/i18n-server": { getLang: async () => lang },
    "@/lib/i18n": { t },
    "@/lib/collections": { UUID_RE },
    "@/lib/auth": { getAdminUser: async () => o.role === null ? null : { id: ACTOR, role: o.role ?? "admin" } },
    "@/lib/supabase/admin": { createAdminClient: () => { clients++; return db; } },
    "@/lib/admin-audit": { journaliserActeAdmin: async (_db: unknown, event: unknown) => { audits.push(structuredClone(event)); } },
    "@/lib/product-kind": kinds,
    "@/lib/digital-file-security": { digitalProductIsClean: async () => { scans++; return o.clean !== false; } },
  });
  const post = (body: unknown) => route.POST(new Request("https://z.test/api/admin/product-status", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  }));
  return { post, rows, audits, db, route, clients: () => clients, scans: () => scans };
}

for (const lang of ["fr", "ht", "en", "es"] as Lang[]) {
  for (const status of ["draft", "archived"]) {
    test(`statut admin : produit absent refuse ${status} sans faux acte (${lang})`, async () => {
      const f = fixture({ lang });
      const before = [...f.rows];
      const res = await f.post({ productId: MISSING, status });
      assert.deepEqual({ status: res.status, body: await res.json(), audits: f.audits, rows: [...f.rows] }, {
        status: 404, body: { error: t(lang, "api.product.notfound") }, audits: [], rows: before,
      });
    });
  }
}

test("statut admin : disparition après la lecture de publication refuse sans faux acte", async () => {
  const f = fixture({ disappear: true });
  const res = await f.post({ productId: PRODUCT, status: "published" });
  assert.deepEqual({ status: res.status, body: await res.json(), audits: f.audits }, {
    status: 404, body: { error: t("fr", "api.product.notfound") }, audits: [],
  });
  assert.equal(f.rows.has(PRODUCT), false);
  assert.equal(f.rows.get(OTHER)!.status, "published");
});

test("statut admin : les trois statuts et les kinds conservent le succès et leur acte exact", async () => {
  for (const kind of ["physical", "service", "fichier"] as const) {
    for (const status of STATUSES) {
      const f = fixture({ kind });
      const res = await f.post({ productId: PRODUCT, status });
      assert.deepEqual({ status: res.status, body: await res.json() }, { status: 200, body: { ok: true, status } });
      assert.equal(f.rows.get(PRODUCT)!.status, status);
      assert.equal(f.rows.get(OTHER)!.status, "published");
      assert.deepEqual(f.audits, [{ actorId: ACTOR, action: "product.set_status", targetType: "product", targetId: PRODUCT, metadata: { status } }]);
    }
  }
});

test("statut admin : erreurs UPDATE traduites, sans mutation ni acte de succès", async () => {
  for (const code of ["23514", "08006"]) {
    const f = fixture({ updateError: code });
    const res = await f.post({ productId: PRODUCT, status: "archived" });
    assert.equal(res.status, code === "23514" ? 422 : 500);
    assert.doesNotMatch(JSON.stringify(await res.json()), /private database error|08006|23514/);
    assert.equal(f.rows.get(PRODUCT)!.status, "draft");
    assert.deepEqual(f.audits, []);
  }
});

test("statut admin : refus d'identité avant tout client privilégié", async () => {
  for (const role of [null, "buyer"] as const) {
    const f = fixture({ role });
    assert.equal((await f.post(null)).status, 403);
    assert.equal(f.clients(), 0);
    assert.equal(f.db.queries.length, 0);
    assert.deepEqual(f.audits, []);
  }
});

test("statut admin : JSON illisible refusé avant DB", async () => {
  const f = fixture();
  const res = await f.route.POST(new Request("https://z.test/x", { method: "POST", body: "{" }));
  assert.equal(res.status, 400);
  assert.equal(f.clients(), 0);
});

test("statut admin : corps et identifiants incompatibles refusés avant DB", async () => {
  const invalid = [null, [], true, 3, "texte", {}, { productId: PRODUCT, status: "other" },
    { productId: 7, status: "draft" }, { productId: [PRODUCT], status: "archived" },
    { productId: {}, status: "draft" }, { productId: "not-a-uuid", status: "draft" }];
  const actual = [];
  for (const body of invalid) {
    const f = fixture();
    try {
      const res = await f.post(body);
      actual.push({ status: res.status, clients: f.clients(), audits: f.audits.length });
    } catch {
      actual.push({ status: "uncaught", clients: f.clients(), audits: f.audits.length });
    }
  }
  assert.deepEqual(actual, invalid.map(() => ({ status: 400, clients: 0, audits: 0 })));
});

test("statut admin : les gardes de livrable et d'analyse restent bloquantes seulement en publication", async () => {
  for (const [options, expected] of [[{ assets: 0 }, 422], [{ assetsError: true }, 503], [{ clean: false }, 503]] as const) {
    const f = fixture({ kind: "fichier", ...options });
    const res = await f.post({ productId: PRODUCT, status: "published" });
    assert.equal(res.status, expected);
    assert.equal(f.rows.get(PRODUCT)!.status, "draft");
    assert.deepEqual(f.audits, []);
    assert.equal(f.db.queries.some(q => q.steps.some(([m]) => m === "update")), false);
    for (const status of ["draft", "archived"]) {
      const removal = fixture({ kind: "fichier", ...options });
      assert.equal((await removal.post({ productId: PRODUCT, status })).status, 200);
      assert.equal(removal.scans(), 0);
    }
  }
});
