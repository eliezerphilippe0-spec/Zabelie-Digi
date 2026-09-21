import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { supervise, probeSite, inspectCI, evaluateWithJev, renderReport, rapportInactif } from "../scripts/jev-supervisor.mjs";

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

test("un refus d’intermédiaire n’atteste pas le contrôle d’accès de Zabelie", async () => {
  // Un proxy, un WAF ou la protection de déploiement répond 401/403 sans que la
  // requête atteigne jamais Zabelie. Mesuré le 2026-09-21 : le proxy d’une
  // session agent rendait 403 et la sonde concluait « pass ».
  for (const response of [
    () => new Response("<html><body>Forbidden by gateway</body></html>", { status: 403 }),
    () => new Response("<html><body>Unauthorized</body></html>", { status: 401 }),
    () => Response.json({ message: "blocked" }, { status: 403 }),
    () => Response.json({ error: "   " }, { status: 403 }),
    () => Response.json({ error: 403 }, { status: 403 }),
  ]) {
    const { fetcher } = fixture({ "/api/admin/jev": response });
    const report = await supervise({ fetcher, now: () => instant, key: "test" });
    assert.equal(report.checks.find((c) => c.id === "access")?.status, "unknown");
    assert.equal(report.priority, "P2");
  }
});

test("un refus applicatif authentique reste un succès, quelle que soit la langue", async () => {
  // Le message d’erreur est TRADUIT par erreurTraduite : la sonde porte sur la
  // forme du corps, jamais sur son texte. Les quatre langues doivent passer.
  for (const message of ["Accès refusé", "Aksè refize", "Access denied", "Acceso denegado"]) {
    const { fetcher } = fixture({ "/api/admin/jev": () => Response.json({ error: message }, { status: 403 }) });
    const report = await supervise({ fetcher, now: () => instant, key: "test" });
    assert.equal(report.checks.find((c) => c.id === "access")?.status, "pass");
    assert.equal(report.priority, "P3");
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

test("sans activation : rapport « inactive », sortie non nulle, aucune sonde tirée", () => {
  // Le chemin réel du CLI, pas seulement supervise(). Mesuré le 2026-09-21 :
  // la garde vivait dans le `if:` du job et rendait un `skipped` muet.
  const dossier = mkdtempSync(join(tmpdir(), "jev-inactif-"));
  try {
    const run = spawnSync(process.execPath, ["scripts/jev-supervisor.mjs", "--output-dir", dossier], {
      env: { ...process.env, JEV_SUPERVISION_ENABLED: "", TYPESAFE_API_KEY: "", GITHUB_TOKEN: "", GITHUB_STEP_SUMMARY: "" },
      encoding: "utf8",
    });
    assert.equal(run.status, 2, "l’absence d’activation doit faire échouer l’étape");
    const report = JSON.parse(readFileSync(join(dossier, "report.json"), "utf8"));
    assert.equal(report.status, "inactive");
    // AUCUNE sonde : la liste ne porte que l’activation. Sept entrées voudraient
    // dire que le site a été sondé sans que le porteur l’ait demandé.
    assert.deepEqual(report.checks.map((c: { id: string }) => c.id), ["activation"]);
    assert.equal(report.jev.status, "not_configured");
    assert.equal(report.mutationsPerformed, 0);
    assert.match(readFileSync(join(dossier, "report.md"), "utf8"), /SUPERVISION INACTIVE/);
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
});

test("une activation approximative ne vaut pas activation", () => {
  for (const valeur of ["false", "True", "1", "yes", " "]) {
    const dossier = mkdtempSync(join(tmpdir(), "jev-approx-"));
    try {
      const run = spawnSync(process.execPath, ["scripts/jev-supervisor.mjs", "--output-dir", dossier], {
        env: { ...process.env, JEV_SUPERVISION_ENABLED: valeur, TYPESAFE_API_KEY: "", GITHUB_TOKEN: "", GITHUB_STEP_SUMMARY: "" },
        encoding: "utf8",
      });
      assert.equal(run.status, 2, `« ${valeur} » ne doit pas activer la supervision`);
      assert.equal(JSON.parse(readFileSync(join(dossier, "report.json"), "utf8")).status, "inactive");
    } finally {
      rmSync(dossier, { recursive: true, force: true });
    }
  }
});

test("la bannière d’inactivité ne s’affiche QUE sur un rapport inactif", async () => {
  assert.match(renderReport(rapportInactif(() => instant)), /SUPERVISION INACTIVE/);
  const { fetcher } = fixture();
  const sain = await supervise({ fetcher, now: () => instant, key: "test" });
  assert.doesNotMatch(renderReport(sain), /SUPERVISION INACTIVE/);
});

test("workflow : activation explicite, main uniquement, jeton lecture seule, zéro installation avec secrets", () => {
  const src = readFileSync(".github/workflows/jev-supervision.yml", "utf8");
  assert.match(src, /cron: "17 \* \* \* \*"/);
  assert.match(src, /github.ref == 'refs\/heads\/main'/);
  // L’activation ne doit PAS garder le job : un `skipped` passe pour un vert.
  // Elle est lue par le script, qui rapporte « inactive » et sort en échec.
  assert.doesNotMatch(src, /if:[^\n]*JEV_SUPERVISION_ENABLED/);
  assert.match(src, /JEV_SUPERVISION_ENABLED: \$\{\{ vars\.JEV_SUPERVISION_ENABLED \}\}/);
  assert.match(src, /contents: read/);
  assert.match(src, /actions: read/);
  assert.match(src, /persist-credentials: false/);
  assert.match(src, /secrets.TYPESAFE_API_KEY/);
  assert.match(src, /if: always\(\)/);
  assert.doesNotMatch(src, /contents: write|issues: write|pull-requests: write|npm ci|pull_request_target|continue-on-error/);
  assert.match(readFileSync(".gitignore", "utf8"), /^\/agent-reports\/$/m);
});
