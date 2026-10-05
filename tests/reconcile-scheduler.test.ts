import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { declencherReconciliation, resumerReconciliation } from "../scripts/declencher-reconciliation.mjs";

const fixture = () => ({
  scanned: 2, confirmed: 1, stillPending: 1, rejected: 0, expired: 0, errors: [] as string[],
  topup: { scanned: 0, confirmed: 0, fulfilled: 0, refundQueued: 0, discrepancies: [] as string[], errors: [] as string[] },
  kobara: { ignore: "rail_non_configure" }, stripe: { ignore: "rail_non_configure" },
});
const configuration = { url: "https://zabelie.com", secret: "secret-fixture", ordonnanceur: "github" };

test("ordonnanceur : une seule requête HTTPS au worker canonique avec le secret isolé", async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const result = await declencherReconciliation({ ...configuration, fetchFn: async (url, init) => {
    calls.push({ url: String(url), init });
    return Response.json(fixture());
  } });
  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://zabelie.com/api/reconcile");
  assert.equal(calls[0].init?.method, "POST");
  assert.equal(calls[0].init?.body, "{}");
  assert.equal(calls[0].init?.redirect, "error");
  assert.equal(calls[0].init?.credentials, "omit");
  assert.equal(calls[0].init?.cache, "no-store");
  assert.ok(calls[0].init?.signal);
  assert.equal(new Headers(calls[0].init?.headers).get("authorization"), "Bearer secret-fixture");
  assert.doesNotMatch(JSON.stringify(result), /secret-fixture|Bearer/);
});

test("ordonnanceur : configuration absente, URL étrangère, credentials et budget invalides n'appellent rien", async () => {
  let calls = 0;
  const fetchFn = async () => { calls++; return Response.json(fixture()); };
  for (const change of [
    { ordonnanceur: undefined }, { ordonnanceur: "vercel" }, { secret: "" }, { secret: "jeton\r\ninduit" },
    { url: "http://zabelie.com" }, { url: "https://zabelie.com.evil.test" }, { url: "https://zabelie.com@evil.test" },
    { url: "https://evil.test@zabelie.com" }, { url: "https://zabelie.com/path" }, { url: "https://zabelie.com?x=1" },
    { url: "https://zabelie.com#fragment" }, { timeoutMs: 0 }, { timeoutMs: 305001 },
  ]) assert.equal((await declencherReconciliation({ ...configuration, ...change, fetchFn })).ok, false);
  assert.equal(calls, 0);
});

test("ordonnanceur : www reste une origine autorisée sans suivre de redirection", async () => {
  const result = await declencherReconciliation({ ...configuration, url: "https://www.zabelie.com", fetchFn: async (url) => {
    assert.equal(String(url), "https://www.zabelie.com/api/reconcile");
    return Response.json(fixture());
  } });
  assert.equal(result.ok, true);
});

test("ordonnanceur : bail déjà tenu est une abstention réussie", async () => {
  const result = await declencherReconciliation({ ...configuration, fetchFn: async () => Response.json({ ignore: "bail_tenu" }) });
  assert.deepEqual(result, { ok: true, statut: "bail_tenu" });
});

test("ordonnanceur : erreurs internes HTTP 200 échouent sans exposer de détail financier", async () => {
  const body = fixture();
  body.errors = ["commande-privee: montant-client-invalide"];
  body.topup.discrepancies = ["commande-privee: divergence-fournisseur"];
  const result = await declencherReconciliation({ ...configuration, fetchFn: async () => Response.json(body) });
  assert.equal(result.ok, false);
  assert.equal(result.statut, "verification_requise");
  assert.equal(result.erreurs, 1);
  assert.equal(result.divergences, 1);
  assert.doesNotMatch(JSON.stringify(result), /commande-privee|montant-client|divergence-fournisseur/);
});

test("ordonnanceur : une file indisponible compte une erreur plutôt qu'un faux zéro", async () => {
  const body = { errors: ["moncash_queue_unavailable"], topup: fixture().topup, kobara: fixture().kobara, stripe: fixture().stripe };
  const result = resumerReconciliation(body);
  assert.equal(result?.ok, false);
  assert.equal(result?.erreurs, 1);
});

test("ordonnanceur : tout rail en erreur doit rendre le passage non sain", () => {
  for (const rail of ["topup", "kobara", "stripe"]) {
    const result = resumerReconciliation({ ...fixture(), [rail]: { error: "erreur-privée" } });
    assert.equal(result?.ok, false, rail);
    assert.equal(result?.erreurs, 1, rail);
    assert.doesNotMatch(JSON.stringify(result), /erreur-privée/);
  }
});

test("ordonnanceur : les sessions introuvables et montants rejetés demandent une vérification", () => {
  const body = { ...fixture(), rejected: 1, stripe: { scanned: 2, confirmed: 0, missingSession: 2, errors: [] }, kobara: { scanned: 1, confirmed: 0, sansIdentifiant: 1, errors: [] } };
  const result = resumerReconciliation(body);
  assert.equal(result?.ok, false);
  assert.equal(result?.sessionsManquantes, 3);
  assert.equal(result?.rejets, 1);
});

test("ordonnanceur : une réponse partielle, vide ou aux compteurs incohérents n'est pas saine", () => {
  for (const body of [null, [], {}, { ok: true }, { ...fixture(), topup: undefined }, { ...fixture(), scanned: -1 },
    { ...fixture(), confirmed: 0.5 }, { ...fixture(), errors: "hidden" }, { ...fixture(), topup: { ...fixture().topup, discrepancies: "hidden" } },
    { ...fixture(), rejected: -1 }, { ...fixture(), scanned: Number.MAX_SAFE_INTEGER, topup: { ...fixture().topup, scanned: 1 } },
    { ...fixture(), stripe: { ignore: "autre" } }]) assert.equal(resumerReconciliation(body), null);
});

test("ordonnanceur : HTTP 401, 302 ou 500 n'exposent pas le corps et ne sont pas retentés", async () => {
  for (const status of [401, 302, 500]) {
    let calls = 0;
    const result = await declencherReconciliation({ ...configuration, fetchFn: async () => {
      calls++; return new Response("secret-fixture: détail-financier", { status });
    } });
    assert.equal(result.ok, false);
    assert.equal(result.http, status);
    assert.equal(calls, 1);
    assert.doesNotMatch(JSON.stringify(result), /secret-fixture|détail-financier/);
  }
});

test("ordonnanceur : les erreurs de transport restent incertaines sans reprise immédiate", async () => {
  let calls = 0;
  const result = await declencherReconciliation({ ...configuration, fetchFn: async () => {
    calls++; throw new Error("secret-fixture dans une panne");
  } });
  assert.deepEqual(result, { ok: false, statut: "transport_incertain" });
  assert.equal(calls, 1);
});

test("ordonnanceur : une réponse suspendue est bornée et annulée", async () => {
  let signal: AbortSignal | undefined;
  let calls = 0;
  const result = await declencherReconciliation({ ...configuration, timeoutMs: 10, fetchFn: async (_url, init) => {
    calls++; signal = init?.signal ?? undefined; return new Promise<Response>(() => {});
  } });
  assert.deepEqual(result, { ok: false, statut: "issue_incertaine" });
  assert.equal(calls, 1);
  assert.equal(signal?.aborted, true);
});

test("ordonnanceur : le délai couvre également un corps qui ne se termine jamais", async () => {
  const result = await declencherReconciliation({ ...configuration, timeoutMs: 10, fetchFn: async () => new Response(new ReadableStream({ start(controller) {
    controller.enqueue(new TextEncoder().encode('{"scanned":'));
  } }), { headers: { "Content-Type": "application/json" } }) });
  assert.deepEqual(result, { ok: false, statut: "issue_incertaine" });
});

test("ordonnanceur : aucun HTML, JSON malformé ou corps démesuré ne devient vert", async () => {
  for (const response of [new Response("<html>login</html>"), new Response("{}broken", { headers: { "Content-Type": "application/json" } }),
    new Response(JSON.stringify({ payload: "x".repeat(66000) }), { headers: { "Content-Type": "application/json" } })]) {
    const result = await declencherReconciliation({ ...configuration, fetchFn: async () => response });
    assert.equal(result.ok, false);
    assert.ok(["reponse_invalide", "reponse_trop_volumineuse"].includes(result.statut));
  }
});

test("ordonnanceur : CLI inactive sort en échec avec un constat sans secret", () => {
  const cli = spawnSync(process.execPath, ["scripts/declencher-reconciliation.mjs"], { encoding: "utf8", env: { ...process.env, ZABELIE_RECONCILE_SCHEDULER: "", RECONCILE_SECRET: "secret-fixture" } });
  assert.equal(cli.status, 1);
  assert.match(cli.stdout, /ordonnanceur_non_configure/);
  assert.doesNotMatch(cli.stdout + cli.stderr, /secret-fixture|Bearer/);
});

test("ordonnanceur : un seul workflow optionnel cible la route, avec délai, bail et aucun service ajouté", () => {
  const workflow = readFileSync(".github/workflows/reconcile.yml", "utf8");
  assert.match(workflow, /cron: "2-59\/5 \* \* \* \*"/);
  assert.match(workflow, /github\.ref == 'refs\/heads\/main' && vars\.ZABELIE_RECONCILE_SCHEDULER == 'github'/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(workflow, /timeout-minutes: 7/);
  assert.match(workflow, /RECONCILE_SECRET: \$\{\{ secrets\.RECONCILE_SECRET \}\}/);
  assert.match(workflow, /node scripts\/declencher-reconciliation\.mjs/);
  assert.doesNotMatch(workflow, /npm ci|curl|--retry|contents: write/);
  const route = readFileSync("app/api/reconcile/route.ts", "utf8");
  assert.match(route, /export const maxDuration = 300/);
  assert.match(route, /avecBail\([\s\S]*?"reconcile"/);
  const vercel = JSON.parse(readFileSync("vercel.json", "utf8"));
  assert.deepEqual(vercel.crons.filter((cron: { path: string }) => cron.path === "/api/reconcile"), [{ path: "/api/reconcile", schedule: "0 12 * * *" }]);
});
