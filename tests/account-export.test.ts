import test from "node:test";
import assert from "node:assert/strict";
import * as collectionExport from "../lib/collection-export";
import { t } from "../lib/i18n";
import { database, loadRoute, type Query } from "./helpers/route-harness";

const SELF = "synthetic-export-owner";
const LISTS = {
  products: { owner: "seller_id", output: "products_as_seller", role: "admin" },
  orders: { owner: "buyer_id", output: "orders_as_buyer", role: "admin" },
  zabelie_policy_acceptances: { owner: "user_id", output: "legal_acknowledgements", role: "admin" },
  zabelie_authoring_projects: { owner: "seller_id", output: "studio_creation.projets", role: "admin" },
  zabelie_authoring_revisions: { owner: "seller_id", output: "studio_creation.revisions", role: "admin" },
  zabelie_authoring_exports: { owner: "seller_id", output: "studio_creation.exports_pdf", role: "admin" },
  zabelie_authoring_operations: { owner: "seller_id", output: "studio_creation.suggestions", role: "admin" },
  zabelie_favorites: { owner: "user_id", output: "favorites", role: "session" },
  zabelie_shop_follows: { owner: "user_id", output: "followed_shops", role: "session" },
  zabelie_order_recipients: { owner: "order.buyer_id", output: "order_recipients", role: "session" },
} as const;
type ListTable = keyof typeof LISTS;
type Failure = { table: string; mode: "error" | "null_data" | "undefined_data" | "object_data" | "null_response" | "throw"; page?: number; code?: string };
type BrokenCount = { table: ListTable; mode: "null" | "missing" | "negative" | "fractional" | "unsafe" | "changed" | "early_empty" | "duplicate" };

function rows(table: string, count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `${table}-${String(index).padStart(6, "0")}`,
    seller_id: table === "zabelie_shop_follows" ? `followed-seller-${index}` : SELF, user_id: SELF, buyer_id: SELF,
    product_id: `product-${index}`, order_id: `order-${index}`, project_id: `project-${index}`,
    policy_version: `synthetic-policy-${index}`, accepted_at: "2026-10-20T00:00:00Z", created_at: "2026-10-20T00:00:00Z",
    titre: `Guide ${index}`, full_name: "Nom fictif", phone: "+509 00000000", locality: "Localité fictive", note: "Note fictive", consented_at: "2026-10-20T00:00:00Z",
    order: { buyer_id: SELF }, chemin: "private-storage-path", bail_jeton: "private-lease-token",
  }));
}

/** Le vrai GET, les vraies collections et le helper partagé. Le faux API
 * plafonne une lecture à 500 lignes : aucune configuration de production
 * n'est supposée. Ses filtres, colonnes et pages restent observables. */
function exportCompte(options: { count?: number; cap?: number; failure?: Failure; brokenCount?: BrokenCount; connecte?: boolean; singleAbsent?: boolean } = {}) {
  const count = options.count ?? 0;
  const queries: (Query & { role: "admin" | "session" })[] = [];
  const attempts = new Map<string, number>();
  const client = (role: "admin" | "session") => database(query => {
    queries.push({ ...query, role });
    assert.ok(!query.steps.some(([method]) => ["insert", "upsert", "update", "delete"].includes(method)), "l'export ne fait aucune écriture");
    const range = query.steps.find(([method]) => method === "range")?.[1] as number[] | undefined;
    const start = range?.[0] ?? 0;
    const page = attempts.get(query.table) ?? 0;
    attempts.set(query.table, page + 1);
    const failure = options.failure;
    if (failure?.table === query.table && (failure.page ?? 0) === page) {
      if (failure.mode === "throw") throw new Error("synthetic_private_database_failure");
      if (failure.mode === "null_response") return null;
      if (failure.mode === "error") return { data: null, error: { code: failure.code ?? "XX001", message: "synthetic_private_database_failure" } };
      if (failure.mode === "null_data") return { data: null, count, error: null };
      if (failure.mode === "undefined_data") return { count, error: null };
      return { data: { unexpected: "object-instead-of-list" }, count, error: null };
    }
    if (query.table === "profiles") return { data: options.singleAbsent ? null : { id: SELF, display_name: "Nom fictif" }, error: null };
    if (query.table === "wallets") return { data: options.singleAbsent ? null : { owner_id: SELF, balance_htg: 100, pending_htg: 0 }, error: null };
    assert.ok(query.table in LISTS, `table inattendue : ${query.table}`);
    const end = Math.min(range?.[1] ?? 499, start + (options.cap ?? 500) - 1);
    const selected = String(query.steps.find(([method]) => method === "select")?.[1][0]);
    const allRows = rows(query.table, count);
    const sort = query.steps.filter(([method]) => method === "order").map(([, args]) => String(args[0]));
    allRows.sort((left, right) => {
      for (const field of sort) {
        const compared = String(left[field as keyof typeof left]).localeCompare(String(right[field as keyof typeof right]));
        if (compared) return compared;
      }
      return 0;
    });
    const broken = options.brokenCount?.table === query.table ? options.brokenCount.mode : null;
    const pageRows = broken === "early_empty" && page === 1 ? [] : allRows.slice(start, end + 1);
    if (broken === "duplicate" && page === 1 && pageRows.length) pageRows[0] = allRows[0];
    const result = pageRows.map(row => {
      if (selected === "*") return row;
      const fields = selected.split(",").map(value => value.trim());
      return Object.fromEntries(Object.entries(row).filter(([key]) => fields.includes(key) || (key === "order" && selected.includes("order:orders!inner"))));
    });
    if (broken === "missing") return { data: result, error: null };
    const reportedCount = broken === "null" ? null : broken === "negative" ? -1 : broken === "fractional" ? 1.5 : broken === "unsafe" ? Number.MAX_SAFE_INTEGER + 1 : broken === "changed" && page === 1 ? count + 1 : count;
    return { data: result, count: reportedCount, error: null };
  });
  const admin = client("admin");
  const session = client("session");
  class ExportResponse extends Response { static json = Response.json; }
  const route = loadRoute("app/api/account/export/route.ts", {
    "next/server": { NextResponse: ExportResponse },
    "@/lib/i18n-server": { getLang: async () => "fr" },
    "@/lib/i18n": { t },
    "@/lib/collection-export": collectionExport,
    "@/lib/supabase/admin": { createAdminClient: () => admin },
    "@/lib/supabase/server": { createClient: async () => ({
      ...session,
      auth: { getUser: async () => ({ data: { user: options.connecte === false ? null : { id: SELF, email: "synthetic@example.test" } }, error: null }) },
    }) },
  });
  return { queries, lire: () => route.GET() };
}

async function indisponible(fixture: ReturnType<typeof exportCompte>) {
  const response = await fixture.lire();
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("Content-Disposition"), null, "aucun export partiel à télécharger");
  const body = await response.text();
  assert.equal(typeof JSON.parse(body).error, "string");
  assert.doesNotMatch(body, /synthetic_private_database_failure/);
}

function contenuComplet(table: ListTable, exported: Record<string, unknown>[], count: number) {
  const field = table === "zabelie_policy_acceptances" ? "policy_version" : table === "zabelie_favorites" ? "product_id" : table === "zabelie_shop_follows" ? "seller_id" : table === "zabelie_order_recipients" ? "order_id" : "id";
  const expectedId = (index: number) => field === "policy_version" ? `synthetic-policy-${index}` : field === "product_id" ? `product-${index}` : field === "seller_id" ? `followed-seller-${index}` : field === "order_id" ? `order-${index}` : `${table}-${String(index).padStart(6, "0")}`;
  assert.deepEqual(exported.map(row => row[field]).sort(), Array.from({ length: count }, (_, index) => expectedId(index)).sort(), `${table} : chaque identifiant attendu est présent une seule fois`);
  const last = exported.find(row => row[field] === expectedId(count - 1));
  assert.ok(last, `${table} : contenu de la dernière tranche`);
  if (table === "products" || table === "orders") assert.equal(last.product_id, `product-${count - 1}`);
  else if (table === "zabelie_authoring_projects" || table === "zabelie_authoring_revisions") assert.equal(last.titre, `Guide ${count - 1}`);
  else if (table === "zabelie_authoring_exports" || table === "zabelie_authoring_operations") assert.equal(last.project_id, `project-${count - 1}`);
  else if (table === "zabelie_policy_acceptances") assert.equal(last.accepted_at, "2026-10-20T00:00:00Z");
  else if (table === "zabelie_order_recipients") {
    assert.deepEqual(last, { order_id: `order-${count - 1}`, full_name: "Nom fictif", phone: "+509 00000000", locality: "Localité fictive", note: "Note fictive", consented_at: "2026-10-20T00:00:00Z" });
  } else assert.equal(last.created_at, "2026-10-20T00:00:00Z");
}

for (const table of ["profiles", "products", "orders", "wallets"]) {
  test(`export de compte : une erreur ${table} refuse le fichier au lieu d'inventer un champ vide`, async () => {
    await indisponible(exportCompte({ failure: { table, mode: "error" } }));
  });
}

test("export de compte : une exception ou une réponse perdue ne devient jamais un téléchargement réussi", async () => {
  for (const table of ["profiles", "wallets", ...Object.keys(LISTS)]) {
    for (const mode of ["null_response", "throw"] as const) {
      await indisponible(exportCompte({ failure: { table, mode } }));
    }
  }
});

test("export de compte : une liste illisible diffère d'une liste vide pour chaque famille exportée", async () => {
  for (const table of Object.keys(LISTS)) {
    for (const mode of ["null_data", "undefined_data", "object_data"] as const) {
      await indisponible(exportCompte({ failure: { table, mode } }));
    }
  }
});

test("export de compte : plus de mille lignes de chaque famille sont conservées avec les mêmes filtres à chaque page", async () => {
  const f = exportCompte({ count: 1103 });
  const response = await f.lire();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("Content-Disposition") ?? "", /mes-donnees-zabelie\.json/);
  const payload = await response.json();
  assert.equal(payload.profile.id, SELF);
  assert.equal(payload.wallet.owner_id, SELF);
  for (const [table, owner] of [["profiles", "id"], ["wallets", "owner_id"]]) {
    const reads = f.queries.filter(query => query.table === table);
    assert.equal(reads.length, 1);
    assert.equal(reads[0].role, "admin");
    assert.deepEqual(reads[0].steps.filter(([method]) => method === "eq"), [["eq", [owner, SELF]]], `${table} : la ligne unique reste bornée au titulaire Auth`);
  }
  for (const [table, definition] of Object.entries(LISTS)) {
    const exported = definition.output.split(".").reduce((value, key) => value[key], payload) as Record<string, unknown>[];
    assert.equal(exported.length, 1103, table);
    contenuComplet(table as ListTable, exported, 1103);
    const reads = f.queries.filter(query => query.table === table);
    assert.equal(reads.length, 3, table);
    const firstSelect = reads[0].steps.find(([method]) => method === "select")?.[1][0];
    for (let page = 0; page < reads.length; page++) {
      const query = reads[page];
      assert.equal(query.role, definition.role, `${table} : client de lecture conservé`);
      assert.ok(query.steps.some(([method, args]) => method === "eq" && args[0] === definition.owner && args[1] === SELF), `${table} : propriété sur la page ${page}`);
      assert.deepEqual(query.steps.find(([method]) => method === "range")?.[1], [page * 500, page * 500 + 499]);
      assert.equal((query.steps.find(([method]) => method === "select")?.[1][1] as { count?: string } | undefined)?.count, "exact", `${table} : décompte explicite à chaque page`);
      assert.ok(query.steps.some(([method]) => method === "order"), `${table} : ordre stable requis`);
      assert.equal(query.steps.find(([method]) => method === "select")?.[1][0], firstSelect, `${table} : ne pas élargir les colonnes en poursuivant`);
      if (table.startsWith("zabelie_authoring_")) assert.doesNotMatch(String(firstSelect), /\*|chemin|bail_jeton/);
    }
  }
});

test("export de compte : un plafond API inférieur à la taille demandée ne tronque aucune famille", async () => {
  const f = exportCompte({ count: 1103, cap: 100 });
  const response = await f.lire();
  assert.equal(response.status, 200);
  const payload = await response.json();
  for (const [table, definition] of Object.entries(LISTS)) {
    const exported = definition.output.split(".").reduce((value, key) => value[key], payload) as Record<string, unknown>[];
    assert.equal(exported.length, 1103, table);
    contenuComplet(table as ListTable, exported, 1103);
    const reads = f.queries.filter(query => query.table === table);
    assert.equal(reads.length, 12, table);
    for (let page = 0; page < reads.length; page++) {
      assert.deepEqual(reads[page].steps.find(([method]) => method === "range")?.[1], [page * 100, page * 100 + 499]);
      assert.ok(reads[page].steps.some(([method, args]) => method === "eq" && args[0] === definition.owner && args[1] === SELF));
    }
  }
});

test("export de compte : un décompte absent, invalide ou changé refuse un fichier déclaré incomplet", async () => {
  for (const mode of ["null", "missing", "negative", "fractional", "unsafe", "changed"] as const) {
    await indisponible(exportCompte({ count: 1103, brokenCount: { table: "orders", mode } }));
  }
});

test("export de compte : une page vide prématurée ou répétée ne donne jamais un faux export complet", async () => {
  for (const mode of ["early_empty", "duplicate"] as const) {
    await indisponible(exportCompte({ count: 1103, brokenCount: { table: "orders", mode } }));
  }
});

test("export de compte : l'échec d'une deuxième page refuse aussi les premières pages déjà reçues", async () => {
  for (const table of Object.keys(LISTS)) {
    await indisponible(exportCompte({ count: 1103, failure: { table, mode: "error", page: 1 } }));
  }
});

test("export de compte : un Studio jamais installé reste facultatif uniquement dès sa première page", async () => {
  for (const table of Object.keys(LISTS).filter(table => table.startsWith("zabelie_authoring_")) as ListTable[]) {
    for (const code of ["42P01", "PGRST205"]) {
      const f = exportCompte({ failure: { table, mode: "error", code } });
      const response = await f.lire();
      assert.equal(response.status, 200);
      const payload = await response.json();
      const exported = LISTS[table].output.split(".").reduce((value, key) => value[key], payload);
      assert.deepEqual(exported, []);
      assert.equal(f.queries.filter(query => query.table === table).length, 1);
    }
  }
});

test("export de compte : une table Studio perdue après une page lisible ne fait pas disparaître cette famille", async () => {
  for (const table of Object.keys(LISTS).filter(table => table.startsWith("zabelie_authoring_"))) {
    await indisponible(exportCompte({ count: 1103, failure: { table, mode: "error", code: "42P01", page: 1 } }));
  }
});

test("export de compte : l'absence légitime d'une ligne unique reste distincte d'une panne", async () => {
  const response = await exportCompte({ singleAbsent: true }).lire();
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.profile, null);
  assert.equal(payload.wallet, null);
});

test("export de compte : sans identité authentifiée, aucune table n'est lue", async () => {
  const f = exportCompte({ connecte: false });
  assert.equal((await f.lire()).status, 401);
  assert.deepEqual(f.queries, []);
});
