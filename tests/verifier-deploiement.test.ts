import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { verifierDeploiement } from "../scripts/verifier-deploiement.mjs";
import { releaseIdForCommit } from "../lib/deployment-release.mjs";

const commit = "a".repeat(40);
const release = releaseIdForCommit(commit);
const defaults = { url: "https://exemple.test", expectedCommit: commit, essais: 2, attendreMs: 0, dormir: async () => {} };
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const fetcher = (fn: (url: string) => Promise<Response>) => fn as typeof fetch;

test("la bonne livraison et une base saine sont toutes deux nécessaires", async () => {
  const calls: string[] = [];
  const result = await verifierDeploiement({ ...defaults, fetchFn: fetcher(async (url) => {
    calls.push(url);
    return response(url.endsWith("/deployment") ? { release } : { ok: true });
  }) });
  assert.equal(result.ok, true);
  assert.deepEqual(calls, ["https://exemple.test/api/deployment", "https://exemple.test/api/readyz"]);
});

test("un ancien site HTTP 200 ne valide jamais une nouvelle livraison", async () => {
  const result = await verifierDeploiement({ ...defaults, fetchFn: fetcher(async (url) => {
    assert.ok(url.endsWith("/deployment"), "inutile de tester la base de la mauvaise livraison");
    return response({ release: releaseIdForCommit("b".repeat(40)), ok: true });
  }) });
  assert.equal(result.ok, false);
  assert.equal(result.tentatives, 2);
});

test("la vérification attend la nouvelle livraison et accepte son arrivée", async () => {
  let attempts = 0;
  const result = await verifierDeploiement({ ...defaults, essais: 4, fetchFn: fetcher(async (url) => {
    if (url.endsWith("/readyz")) return response({ ok: true });
    attempts++;
    return response({ release: attempts < 3 ? null : release });
  }) });
  assert.equal(result.ok, true);
  assert.equal(result.tentatives, 3);
});

test("URL ou commit absent/invalide : échec avant le réseau", async () => {
  const fetchFn: typeof fetch = async () => { throw new Error("réseau interdit"); };
  for (const url of [undefined, "", "file:///tmp/x", "https://user:password@exemple.test", "https://exemple.test/path", "https://exemple.test/?q=1"]) {
    const result = await verifierDeploiement({ ...defaults, url, fetchFn });
    assert.equal(result.ok, false);
    assert.equal(result.tentatives, 0);
    assert.match(result.motif, /ZABELIE_URL/);
  }
  for (const expectedCommit of [undefined, "", "abc123", "z".repeat(40)]) {
    const result = await verifierDeploiement({ ...defaults, expectedCommit, fetchFn });
    assert.equal(result.ok, false);
    assert.equal(result.tentatives, 0);
    assert.match(result.motif, /ZABELIE_EXPECTED_COMMIT/);
  }
});

test("un corps trompeur, un 503 ou une réponse non JSON ne passent pas", async () => {
  for (const body of [null, { ok: false }, { ok: "true" }, {}]) {
    const result = await verifierDeploiement({ ...defaults, fetchFn: fetcher(async (url) => response(url.endsWith("/deployment") ? { release } : body)) });
    assert.equal(result.ok, false);
  }
  for (const failure of [response({ release }, 503), new Response("<html>erreur</html>")]) {
    const result = await verifierDeploiement({ ...defaults, fetchFn: async () => failure.clone() });
    assert.equal(result.ok, false);
  }
});

test("une panne réseau épuise les essais puis échoue", async () => {
  let calls = 0;
  const result = await verifierDeploiement({ ...defaults, fetchFn: async () => { calls++; throw new Error("ENOTFOUND"); } });
  assert.equal(result.ok, false);
  assert.equal(calls, 2);
  assert.match(result.motif, /ENOTFOUND/);
});

test("un serveur qui ne répond jamais est interrompu, corps compris", async () => {
  for (const phase of ["connection", "body"]) {
    let signal: AbortSignal | null | undefined;
    const result = await verifierDeploiement({ ...defaults, essais: 1, timeoutMs: 15, fetchFn: async (_url, init) => {
      signal = init?.signal;
      if (phase === "connection") return new Promise<Response>(() => {});
      return { status: 200, json: () => new Promise(() => {}) } as Response;
    } });
    assert.equal(result.ok, false);
    assert.equal(signal?.aborted, true);
    assert.match(result.motif, /délai/);
  }
});

test("le workflow transmet le commit exact et n'utilise pas une pause comme preuve", () => {
  const workflow = readFileSync(".github/workflows/post-deploy.yml", "utf8");
  assert.match(workflow, /on:\s*\n\s*push:\s*\n\s*branches: \[main\]/);
  assert.match(workflow, /ZABELIE_URL: \$\{\{ vars\.ZABELIE_URL \}\}/);
  assert.match(workflow, /ZABELIE_EXPECTED_COMMIT: \$\{\{ github\.sha \}\}/);
  assert.match(workflow, /node scripts\/verifier-deploiement\.mjs/);
});
