import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { supervise, probeSite, inspectCI, evaluateWithJev, renderReport } from "../scripts/jev-supervisor.mjs";

const commit = "a".repeat(40);
const release = createHash("sha256").update(commit).digest("hex");
const instant = Date.parse("2026-09-21T03:00:00Z");
const jevReply = (priority = "P3", runbook = "observe", confidence = 0.9) => ({
  answers: {
    priority: { type: "choice", choice: priority, confidence },
    runbook: { type: "choice", choice: runbook, confidence },
  },
});

function fixture(overrides: Record<string, () => Response | Promise<Response>> = {}) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, init });
    const path = new URL(url).pathname;
    if (overrides[path]) return overrides[path]();
    assert.equal(init?.redirect, "error");
    assert.equal(init?.cache, "no-store");
    assert.ok(init?.signal);
    switch (path) {
      case "/": return new Response("<html><title>Zabelie</title></html>");
      case "/api/health": return Response.json({ ok: true, time: new Date(instant).toISOString() });
      case "/api/readyz": return Response.json({ ok: true, latencyMs: 40 });
      case "/api/deployment": return Response.json({ release });
      case "/api/admin/jev": return Response.json({ error: "refused" }, { status: 403 });
      case "/repos/eliezerphilippe0-spec/Zabelie-Digi/commits/main": return Response.json({ sha: commit });
      case "/repos/eliezerphilippe0-spec/Zabelie-Digi/actions/workflows/ci.yml/runs": return Response.json({ workflow_runs: [{ head_sha: commit, status: "completed", conclusion: "success" }] });
      case "/v1/systemone": return Response.json(jevReply());
      default: throw new Error("unexpected_destination");
    }
  };
  return { fetcher, calls };
}

test("superviseur : cycle simulé sain, sortie bornée et aucune mutation métier", async () => {
  const { fetcher, calls } = fixture();
  const result = await supervise({ fetcher, now: () => instant, key: "test-type-safe", githubToken: "test-github" });
  assert.equal(result.status, "healthy");
  assert.equal(result.jev.status, "ok");
  assert.equal(result.mutationsPerformed, 0);
  assert.equal(result.checks.length, 7);
  assert.ok(result.checks.every((c) => c.status === "pass"));
  const jev = calls.filter((c) => c.url === "https://api.typesafe.ai/v1/systemone");
  assert.equal(jev.length, 1);
  for (const call of calls) {
    const host = new URL(call.url).hostname;
    const auth = new Headers(call.init?.headers).get("Authorization");
    assert.equal(auth, host === "api.typesafe.ai" ? "Bearer test-type-safe" : host === "api.github.com" ? "Bearer test-github" : null);
    if (call.init?.method === "POST") assert.ok(call.url === "https://api.typesafe.ai/v1/systemone" || (call.url === "https://zabelie.com/api/admin/jev" && call.init.body === "{}"));
  }
  const state = JSON.parse(JSON.parse(jev[0].init?.body as string).state);
  assert.deepEqual(Object.keys(state), ["checks"]);
  assert.ok(state.checks.every((c: object) => Object.keys(c).sort().join() === "id,status"));
  assert.doesNotMatch(JSON.stringify(result), /test-type-safe|test-github|<html|Bearer/);
});

test("la clé absente laisse les sondes actives mais rend le résultat dégradé", async () => {
  const { fetcher, calls } = fixture();
  const result = await supervise({ fetcher, now: () => instant });
  assert.equal(result.jev.status, "not_configured");
  assert.equal(result.status, "degraded");
  assert.ok(result.checks.some((c) => c.id === "jev" && c.status === "unknown"));
  assert.equal(calls.filter((c) => c.url.includes("typesafe.ai")).length, 0);
});

test("Jev ne peut pas minimiser une panne et les GET sont rejoués au plus une fois", async () => {
  const { fetcher, calls } = fixture({ "/api/readyz": () => Response.json({ ok: false, latencyMs: 100 }, { status: 503 }) });
  const report = await supervise({ fetcher, now: () => instant, key: "test" });
  assert.equal(report.priority, "P1");
  assert.equal(report.status, "incident");
  assert.ok(report.recommendations.some((r) => r.id === "database"));
  assert.ok(!report.recommendations.some((r) => r.id === "observe"));
  assert.equal(calls.filter((c) => c.url.endsWith("/api/readyz")).length, 2);
});

test("un accès non refusé est une alerte urgente, sans répéter le POST", async () => {
  const { fetcher, calls } = fixture({ "/api/admin/jev": () => Response.json({ data: "never forward this" }) });
  const report = await supervise({ fetcher, now: () => instant, key: "test" });
  assert.equal(report.priority, "P0");
  assert.equal(calls.filter((c) => c.url.endsWith("/api/admin/jev")).length, 1);
  assert.doesNotMatch(JSON.stringify(report), /never forward this/);
});

test("une panne transitoire rétablie est signalée, pas masquée en succès", async () => {
  let attempts = 0;
  const { fetcher } = fixture({ "/api/readyz": () => ++attempts === 1 ? Response.json({}, { status: 503 }) : Response.json({ ok: true, latencyMs: 4 }) });
  const report = await supervise({ fetcher, now: () => instant, key: "test" });
  assert.equal(report.status, "degraded");
  assert.equal(report.checks.find((c) => c.id === "database")?.status, "warning");
});

test("une sonde d’accès indisponible n’est pas présentée comme une faille confirmée", async () => {
  for (const response of [() => new Response("unavailable", { status: 503 }), () => { throw new Error("network"); }]) {
    const { fetcher } = fixture({ "/api/admin/jev": response });
    const report = await supervise({ fetcher, now: () => instant, key: "test" });
    assert.equal(report.priority, "P2");
    assert.equal(report.checks.find((c) => c.id === "access")?.status, "unknown");
  }
});

test("une alerte relevée par Jev ne conseille pas de ne rien faire", async () => {
  const { fetcher } = fixture({ "/v1/systemone": () => Response.json(jevReply("P1", "observe")) });
  const report = await supervise({ fetcher, now: () => instant, key: "test" });
  assert.equal(report.priority, "P1");
  assert.ok(report.recommendations.every((r) => r.requiresHumanApproval));
});

test("CI : une ancienne réussite n’atteste pas du commit courant", async () => {
  const { fetcher } = fixture({ "/repos/eliezerphilippe0-spec/Zabelie-Digi/actions/workflows/ci.yml/runs": () => Response.json({ workflow_runs: [{ head_sha: "b".repeat(40), status: "completed", conclusion: "success" }] }) });
  assert.equal((await inspectCI({ fetcher })).status, "unknown");
});

test("CI en cours, échec, refus et réponse malformée sont distingués", async () => {
  const path = "/repos/eliezerphilippe0-spec/Zabelie-Digi/actions/workflows/ci.yml/runs";
  for (const [status, conclusion, expected] of [["in_progress", null, "pending"], ["completed", "failure", "fail"], ["completed", "cancelled", "fail"]]) {
    const { fetcher } = fixture({ [path]: () => Response.json({ workflow_runs: [{ head_sha: commit, status, conclusion }] }) });
    assert.equal((await inspectCI({ fetcher })).status, expected);
  }
  for (const response of [() => Response.json({}, { status: 403 }), () => Response.json({ workflow_runs: null })]) {
    assert.equal((await inspectCI({ fetcher: fixture({ [path]: response }).fetcher })).status, "unknown");
  }
});

test("JSON invalide, faux ok et ancienne sonde ne passent pas", async () => {
  for (const response of [() => new Response("html"), () => Response.json({ ok: "true", time: new Date(instant).toISOString() }), () => Response.json({ ok: true, time: "2020-01-01" })]) {
    const { fetcher } = fixture({ "/api/health": response });
    assert.equal((await probeSite({ fetcher, now: () => instant })).checks.find((c) => c.id === "health")?.status, "fail");
  }
});

test("le décalage de livraison est explicite, sans déploiement automatique", async () => {
  const { fetcher } = fixture({ "/api/deployment": () => Response.json({ release: "b".repeat(64) }) });
  const report = await supervise({ fetcher, now: () => instant, key: "test" });
  assert.equal(report.checks.find((c) => c.id === "release_alignment")?.status, "warning");
  assert.equal(report.mutationsPerformed, 0);
});

test("Jev invalide, indisponible ou malveillant ne produit jamais de commande", async () => {
  for (const response of [
    () => Response.json(jevReply("P3", "delete_database")),
    () => Response.json(jevReply("P4")),
    () => Response.json(jevReply("P3", "observe", 2)),
    () => new Response("provider-secret-and-customer-data", { status: 401 }),
    () => { throw new Error("provider-secret-and-customer-data"); },
    () => Response.json({ answers: null }),
    () => new Response("x".repeat(33000)),
  ]) {
    const result = await evaluateWithJev([], { key: "test", fetcher: fixture({ "/v1/systemone": response }).fetcher });
    assert.deepEqual(result, { status: "unavailable" });
  }
});

test("le délai coupe un fournisseur qui ne répond pas", async () => {
  const fetcher: typeof fetch = async (_url, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new Error("private_detail")), { once: true });
  });
  assert.deepEqual(await evaluateWithJev([], { key: "test", fetcher, timeoutMs: 10 }), { status: "unavailable" });
});

test("faible confiance : le classement Jev est conservé mais pas appliqué", async () => {
  const { fetcher } = fixture({ "/v1/systemone": () => Response.json(jevReply("P0", "database", 0.1)) });
  const result = await supervise({ fetcher, now: () => instant, key: "test" });
  assert.equal(result.priority, "P3");
  assert.equal(result.jev.confidence, 0.1);
  assert.equal(result.recommendations[0].id, "observe");
  assert.match(renderReport(result), /non exécutée/);
});

test("workflow : activation explicite, main uniquement, jeton lecture seule, zéro installation avec secrets", () => {
  const src = readFileSync(".github/workflows/jev-supervision.yml", "utf8");
  assert.match(src, /cron: "17 \* \* \* \*"/);
  assert.match(src, /github.ref == 'refs\/heads\/main'/);
  assert.match(src, /vars.JEV_SUPERVISION_ENABLED == 'true'/);
  assert.match(src, /contents: read/);
  assert.match(src, /actions: read/);
  assert.match(src, /persist-credentials: false/);
  assert.match(src, /secrets.TYPESAFE_API_KEY/);
  assert.match(src, /if: always\(\)/);
  assert.doesNotMatch(src, /contents: write|issues: write|pull-requests: write|npm ci|pull_request_target|continue-on-error/);
  assert.match(readFileSync(".gitignore", "utf8"), /^\/agent-reports\/$/m);
});
