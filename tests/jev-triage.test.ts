import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { JOURNAL_TABLE, jevTriageEnabled, triageSupportMessage, type JournalRow, type TriageEnv } from "../lib/jev/triage";
import { INTENTS } from "../lib/jev/taxonomy";

/**
 * Triage Jev en observation (docs/61 §8). Chaque garde passé sur un cas
 * connu-positif et un cas connu-négatif ; aucun réseau, transport injecté.
 */

const RAW = "Mwen rele Jan, mwen peye 1500 goud, kòmand ZB-250923-ACD7K, rele m +509 3737-6615";
const INPUT = { caseId: "11400000-0000-4000-8000-000000000030", requestId: "11400000-0000-4000-8000-000000000040", body: RAW };
const ON: TriageEnv = { ZABELIE_JEV_TRIAGE_ENABLED: "true", TYPESAFE_API_KEY: "test-only-value", JEV_TIMEOUT_MS: "1000" };
const valid = (over: Partial<Record<"choice" | "confidence" | "esk" | "ijans", unknown>> = {}) => ({
  model: "jev-1.13",
  answers: {
    entansyon: { type: "choice", choice: over.choice ?? "pwoblem_peman", confidence: over.confidence ?? 0.82 },
    eskalade: { type: "noul", noul: over.esk ?? 0.91 },
    ijans: { type: "noul", noul: over.ijans ?? 0.4 },
  },
});
const noSleep = async () => undefined;

function harness() {
  const rows: JournalRow[] = [];
  let calls = 0;
  return {
    rows,
    get calls() { return calls; },
    deps: (respond: () => Response | Promise<Response>) => ({
      sleep: noSleep,
      fetcher: (async () => { calls++; return respond(); }) as typeof fetch,
      journal: async (row: JournalRow) => { rows.push(row); return true; },
    }),
  };
}

// ── Drapeau ──────────────────────────────────────────────────────────────────

test("drapeau fermé par défaut : ni appel, ni journal — comportement actuel inchangé", async () => {
  for (const flag of [undefined, "", "false", "TRUE", "1", "yes", " true", "true "]) {
    const h = harness();
    const env = { ...ON, ZABELIE_JEV_TRIAGE_ENABLED: flag };
    assert.equal(jevTriageEnabled(env), false, String(flag));
    const out = await triageSupportMessage(INPUT, env, h.deps(() => Response.json(valid())));
    assert.deepEqual(out, { route: "file_humaine", triage: "desactive" });
    assert.equal(h.calls, 0);
    assert.equal(h.rows.length, 0);
  }
  assert.equal(jevTriageEnabled({ ZABELIE_JEV_TRIAGE_ENABLED: "true" }), true);
});

// ── Décision journalisée, sans texte ─────────────────────────────────────────

test("drapeau posé : une ligne complète, sans aucun texte du message", async () => {
  const h = harness();
  const out = await triageSupportMessage(INPUT, ON, h.deps(() => Response.json(valid())));
  assert.deepEqual(out, { route: "file_humaine", triage: "observe", journalise: true });
  assert.equal(h.calls, 1);
  assert.equal(h.rows.length, 1);
  const row = h.rows[0];
  assert.deepEqual(Object.keys(row).sort(), [
    "attempts", "case_id", "confidence", "entansyon", "eskalade_p", "failure_reason", "ijans_p",
    "latency_ms", "masquages", "mode", "model_demande", "model_rendu", "outcome", "request_id",
  ]);
  assert.deepEqual(
    [row.outcome, row.mode, row.entansyon, row.confidence, row.eskalade_p, row.ijans_p, row.model_rendu, row.attempts],
    ["classe", "observation", "pwoblem_peman", 0.82, 0.91, 0.4, "jev-1.13", 1],
  );
  assert.deepEqual(row.masquages, { imel: 0, lyen: 0, id: 0, komand: 1, nimewo: 1, non: 1 });
  const serialized = JSON.stringify(row);
  for (const fragment of ["Jan", "1500", "goud", "3737", "ACD7K", "peye", "rele"]) {
    assert.ok(!serialized.includes(fragment), `le journal contient « ${fragment} »`);
  }
});

test("ce qui part chez Jev est la version masquée", async () => {
  let sent = "";
  await triageSupportMessage(INPUT, ON, {
    sleep: noSleep,
    fetcher: (async (_u: unknown, init?: RequestInit) => { sent = String(init?.body); return Response.json(valid()); }) as typeof fetch,
    journal: async () => true,
  });
  assert.match(sent, /\[NIMEWO\]/);
  assert.match(sent, /\[KOMAND\]/);
  assert.doesNotMatch(sent, /3737|ACD7K|rele Jan/);
});

// ── Échec sûr ────────────────────────────────────────────────────────────────

test("échec sûr : clé absente, délai, 529 répété, réponse invalide → file humaine et échec nommé", async () => {
  const cases: [string, TriageEnv, () => Response | Promise<Response>, number][] = [
    ["config", { ZABELIE_JEV_TRIAGE_ENABLED: "true" }, () => Response.json(valid()), 0],
    ["config", { ...ON, JEV_BASE_URL: "http://evil.test" }, () => Response.json(valid()), 0],
    ["http_529", ON, () => new Response("secret provider body", { status: 529 }), 3],
    ["invalid_response", ON, () => Response.json(valid({ choice: "release_funds" })), 1],
    ["http_401", ON, () => new Response("secret", { status: 401 }), 1],
  ];
  for (const [reason, env, respond, calls] of cases) {
    const h = harness();
    const out = await triageSupportMessage(INPUT, env, h.deps(respond));
    assert.deepEqual(out, { route: "file_humaine", triage: "observe", journalise: true }, reason);
    assert.equal(h.calls, calls, reason);
    const row = h.rows[0];
    assert.deepEqual([row.outcome, row.failure_reason, row.entansyon, row.confidence, row.eskalade_p], ["echec", reason, null, null, null]);
    assert.doesNotMatch(JSON.stringify(row), /secret|3737/);
  }
  const t = harness();
  const timeout = await triageSupportMessage(INPUT, ON, {
    journal: async (row) => { t.rows.push(row); return true; },
    fetcher: ((_u: unknown, init?: RequestInit) => new Promise((_r, rej) => init?.signal?.addEventListener("abort", () => rej(new Error("x"))))) as typeof fetch,
  });
  assert.equal(timeout.route, "file_humaine");
  assert.equal(t.rows[0].failure_reason, "timeout");
});

test("Jev ne décide jamais de ne pas escalader : même sûr de lui, le message reste en file humaine", async () => {
  for (const esk of [0, 0.01, 0.99]) {
    const h = harness();
    const out = await triageSupportMessage(INPUT, ON, h.deps(() => Response.json(valid({ choice: "lot", confidence: 0.99, esk }))));
    assert.equal(out.route, "file_humaine");
  }
});

test("journal indisponible ou qui lève : aucune exception ne remonte", async () => {
  for (const journal of [async () => false, async () => { throw new Error("db down"); }]) {
    const out = await triageSupportMessage(INPUT, ON, { sleep: noSleep, fetcher: (async () => Response.json(valid())) as typeof fetch, journal });
    assert.deepEqual(out, { route: "file_humaine", triage: "observe", journalise: false });
  }
});

// ── Branchement de la route ──────────────────────────────────────────────────

test("route support : triage APRÈS l'écriture, sous drapeau, hors rejeu, via after(), réponse inchangée", () => {
  const route = readFileSync("app/api/support/cases/route.ts", "utf8");
  // La condition qui COMMANDE, avec sa liaison : `saved` est la donnée de la RPC.
  assert.match(route, /const \{ data, error \} = await admin\.rpc\("zabelie_submit_support"/);
  assert.match(route, /const saved = data as \{ id\?: unknown; duplicate\?: unknown \} \| null;/);
  assert.match(
    route,
    /if \(jevTriageActive\(\) && typeof saved\?\.id === "string" && saved\.duplicate !== true\) \{\s*const caseId = saved\.id;\s*after\(\(\) => triageSupportInBackground\(\{ caseId, requestId: body\.data\.requestId, body: body\.data\.message \}\)\);\s*\}/,
  );
  assert.equal(route.match(/triageSupportInBackground\(/g)?.length, 1, "un seul appel au triage");
  const errorReturn = route.indexOf("if (error) return erreurTraduite(");
  assert.ok(errorReturn > 0 && errorReturn < route.indexOf("jevTriageActive()"), "le triage doit suivre le contrôle d'erreur");
  assert.match(route, /\}\s*return NextResponse\.json\(data,\{headers:\{"Cache-Control":"no-store"\}\}\);\s*\}\s*$/);
});

test("câblage serveur : server-only, lectures d'environnement explicites, écriture du seul journal", () => {
  const src = readFileSync("lib/jev/triage-server.ts", "utf8");
  assert.match(src, /^import "server-only";/);
  for (const v of ["ZABELIE_JEV_TRIAGE_ENABLED", "TYPESAFE_API_KEY", "JEV_BASE_URL", "JEV_MODEL", "JEV_TIMEOUT_MS"]) {
    assert.match(src, new RegExp(`${v}: process\\.env\\.${v},`));
  }
  assert.doesNotMatch(src, /NEXT_PUBLIC_/);
  assert.match(src, /admin\.from\(JOURNAL_TABLE\)\.insert\(row\)/);
  assert.doesNotMatch(src, /\.(select|update|upsert|delete|rpc)\(/);
});

// ── Confinement : aucun accès financier ──────────────────────────────────────

const FORBIDDEN_TABLES = /^(orders|payments|payouts|wallets|wallet_transactions|escrow_entries|refunds|kyc\w*|zabelie_topup\w*|zabelie_admin_actions|profiles|zabelie_support_messages|zabelie_support_cases)$/;

test("confinement : lib/jev/ n'écrit que dans zabelie_jev_decisions, ne lit aucune table, n'appelle aucune RPC", () => {
  assert.equal(JOURNAL_TABLE, "zabelie_jev_decisions");
  const dir = "lib/jev";
  const files = readdirSync(dir).filter((f) => f.endsWith(".ts"));
  assert.deepEqual(files.sort(), ["client.ts", "redact.ts", "taxonomy.ts", "triage-server.ts", "triage.ts"]);
  for (const f of files) {
    const src = readFileSync(join(dir, f), "utf8");
    const specs = [...src.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)].map((m) => m[1]);
    const allowed = f === "triage-server.ts"
      ? ["server-only", "@/lib/supabase/admin", "@/lib/jev/triage"]
      : ["zod", "./client", "./redact", "./taxonomy"];
    for (const spec of specs) assert.ok(allowed.includes(spec), `${f} importe ${spec}`);
    assert.doesNotMatch(src, /\.rpc\(/, `${f} appelle une RPC`);
    for (const m of src.matchAll(/\.from\(\s*([^)]*)\)/g)) assert.equal(m[1].trim(), "JOURNAL_TABLE", `${f} : .from(${m[1]})`);
    for (const m of src.matchAll(/["'`]([a-z_]+)["'`]/g)) assert.doesNotMatch(m[1], FORBIDDEN_TABLES, `${f} nomme ${m[1]}`);
  }
});

test("le harnais d'évaluation n'importe que node:, zod, ses fichiers et le cœur pur de lib/jev", () => {
  const dir = "scripts/jev-eval";
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".ts"))) {
    const src = readFileSync(join(dir, f), "utf8");
    for (const m of src.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)) {
      const spec = m[1];
      const ok = spec.startsWith("node:") || spec === "zod" || spec.startsWith("./") ||
        ["../../lib/jev/client", "../../lib/jev/redact", "../../lib/jev/taxonomy"].includes(spec);
      assert.ok(ok, `${f} importe ${spec}`);
    }
    assert.doesNotMatch(src, /\.(?:from|rpc)\(\s*["'`]|createAdminClient|triage-server/, f);
  }
});

// ── Croisement TS ↔ SQL : la taxonomie est adressée par chaîne ───────────────

test("la contrainte SQL de 0117 porte exactement la taxonomie de lib/jev/taxonomy.ts", () => {
  const sql = readFileSync("supabase/migrations/0117_jev_triage_journal.sql", "utf8");
  const block = /entansyon text check\(entansyon is null or entansyon in\(([^)]*)\)\)/.exec(sql);
  assert.ok(block, "contrainte d'intention introuvable dans 0117");
  const sqlIntents = [...block[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  assert.deepEqual(sqlIntents, [...INTENTS]);
});
