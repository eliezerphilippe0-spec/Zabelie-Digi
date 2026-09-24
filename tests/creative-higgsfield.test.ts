import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildHiggsfieldBody, createHiggsfieldProvider, higgsfieldConfigFromEnv, HIGGSFIELD_RATIOS, PROMPT_MAX, type Transport,
} from "../lib/creative/providers/higgsfield";
import { runGeneration } from "../lib/creative/providers/creative";
import { buildBriefs, type Brief } from "../lib/creative/prompt-builder";
import { NEGATIF_SYSTEMATIQUE, PROPOSITION } from "../lib/creative/rule";

/**
 * Provider Higgsfield (docs/65 §3). Aucun réseau : transport injecté.
 * Chaque garde a son cas qui passe et son cas refusé.
 */

const CFG = { keyId: "id-test", keySecret: "secret-test", timeoutMs: 5000 };
const PHOTO = "https://cdn.zabelie.test/p/1.jpg";
const briefs = (): Brief[] => {
  const r = buildBriefs({ id: "p1", price_htg: 1000, imageUrl: PHOTO }, {});
  assert.ok(r.ok);
  return r.briefs;
};

type Call = { url: string; method: string; headers: Record<string, string>; body?: string };
function transport(replies: Array<{ status: number; json: unknown }>) {
  const calls: Call[] = [];
  const t: Transport = async (url, init) => {
    calls.push({ url, method: init.method, headers: init.headers, body: init.body });
    const r = replies.shift();
    if (!r) throw new Error("plus_de_reponse");
    return { status: r.status, json: async () => r.json };
  };
  return { t, calls };
}

test("config : les deux moitiés de la clé sont exigées ; timeout borné", () => {
  assert.throws(() => higgsfieldConfigFromEnv({}), /config_cle_absente/);
  assert.throws(() => higgsfieldConfigFromEnv({ HF_API_KEY_ID: "a" }), /config_cle_absente/);
  assert.throws(() => higgsfieldConfigFromEnv({ HF_API_KEY_ID: "a", HF_API_KEY_SECRET: "b", HF_TIMEOUT_MS: "10" }), /config_timeout_invalide/);
  assert.deepEqual(higgsfieldConfigFromEnv({ HF_API_KEY_ID: " a ", HF_API_KEY_SECRET: "b" }), { keyId: "a", keySecret: "b", timeoutMs: 15_000 });
});

test("corps : photo produit en entrée, pas de réécriture, interdits dans le prompt, aucun champ inventé", () => {
  for (const b of briefs()) {
    const body = buildHiggsfieldBody(b, PHOTO);
    assert.deepEqual(Object.keys(body).sort(),
      ["aspect_ratio", "enhance_prompt", "image_urls", "moderation", "prompt", "quality", "resolution"]);
    assert.deepEqual(body.image_urls, [PHOTO]);
    assert.equal(body.enhance_prompt, false);
    assert.equal(body.aspect_ratio, b.format);
    assert.ok(body.prompt.length <= PROMPT_MAX, `${body.prompt.length}`);
    // Les sept interdits passent tous, après le prompt positif.
    for (const n of NEGATIF_SYSTEMATIQUE) assert.ok(body.prompt.includes(n), n);
    assert.ok(body.prompt.indexOf("Strictly avoid:") > body.prompt.indexOf(b.prompt.slice(0, 40)));
  }
});

test("corps : chaque format du Studio est un ratio Higgsfield ; 4:5 refusé", () => {
  for (const f of PROPOSITION.formats) assert.ok((HIGGSFIELD_RATIOS as readonly string[]).includes(f), f);
  const b = briefs()[0];
  assert.throws(() => buildHiggsfieldBody({ ...b, format: "4:5" as Brief["format"] }, PHOTO), /format_non_supporte/);
});

test("corps : image de référence https sans identifiants ; prompt trop long refusé, jamais tronqué", () => {
  const b = briefs()[0];
  assert.throws(() => buildHiggsfieldBody(b, "http://cdn.zabelie.test/p.jpg"), /image_reference_invalide/);
  assert.throws(() => buildHiggsfieldBody(b, "https://u:p@cdn.zabelie.test/p.jpg"), /image_reference_invalide/);
  assert.throws(() => buildHiggsfieldBody({ ...b, prompt: "x".repeat(PROMPT_MAX) }, PHOTO), /prompt_trop_long/);
});

test("soumission : en-tête Key id:secret, endpoint 2.0 Alpha, référence validée", async () => {
  const { t, calls } = transport([{ status: 200, json: { status: "queued", request_id: "req_123", status_url: "https://evil.test/x" } }]);
  const p = createHiggsfieldProvider(CFG, { transport: t });
  const r = await p.submit({ idempotencyKey: "k", brief: briefs()[0], referenceImageUrl: PHOTO });
  assert.deepEqual(r, { ok: true, providerRef: "req_123" });
  assert.equal(calls[0].url, "https://api.higgsfield.ai/marketing-studio/image");
  assert.equal(calls[0].method, "POST");
  assert.equal(calls[0].headers.Authorization, "Key id-test:secret-test");
});

test("soumission : 429/5xx relançables, 4xx non, réponse sans request_id ou avec référence piégée refusée", async () => {
  const cas: Array<[number, unknown, string, boolean]> = [
    [429, {}, "http_429", true], [503, {}, "http_503", true], [401, {}, "http_401", false], [422, {}, "http_422", false],
    [200, { status: "queued" }, "reponse_invalide", false], [200, { request_id: "../../admin" }, "reponse_invalide", false],
  ];
  for (const [status, json, error, retry] of cas) {
    const { t } = transport([{ status, json }]);
    const r = await createHiggsfieldProvider(CFG, { transport: t }).submit({ idempotencyKey: "k", brief: briefs()[0], referenceImageUrl: PHOTO });
    assert.deepEqual(r, { ok: false, retryable: retry, error }, `${status}`);
  }
  const reseau: Transport = async () => { throw new Error("ECONNRESET"); };
  assert.deepEqual(await createHiggsfieldProvider(CFG, { transport: reseau }).submit({ idempotencyKey: "k", brief: briefs()[0], referenceImageUrl: PHOTO }),
    { ok: false, retryable: true, error: "reseau" });
});

test("statut : URL reconstruite depuis la référence, jamais reprise de la réponse", async () => {
  const { t, calls } = transport([{ status: 200, json: { status: "queued" } }]);
  const p = createHiggsfieldProvider(CFG, { transport: t });
  assert.deepEqual(await p.status("req_123"), { state: "generating" });
  assert.equal(calls[0].url, "https://api.higgsfield.ai/requests/req_123/status");
  assert.deepEqual(await p.status("../x"), { state: "failed", error: "reference_invalide" });
  assert.equal(calls.length, 1);
});

test("statut : completed exige une image https ; état inconnu nommé, jamais interprété", async () => {
  const inconnus: string[] = [];
  const { t } = transport([
    { status: 200, json: { status: "completed", images: [{ url: "https://cdn.higgsfield.test/a.png" }] } },
    { status: 200, json: { status: "completed", images: [] } },
    { status: 200, json: { status: "completed", images: [{ url: "http://cdn.higgsfield.test/a.png" }] } },
    { status: 200, json: { status: "in_progress" } },
    { status: 503, json: {} },
    { status: 404, json: {} },
    { status: 200, json: { nope: 1 } },
  ]);
  const p = createHiggsfieldProvider(CFG, { transport: t, etatInconnu: (e) => inconnus.push(e) });
  assert.deepEqual(await p.status("r1"), { state: "completed", imageUrl: "https://cdn.higgsfield.test/a.png" });
  assert.deepEqual(await p.status("r1"), { state: "failed", error: "image_absente" });
  assert.deepEqual(await p.status("r1"), { state: "failed", error: "image_absente" });
  assert.deepEqual(await p.status("r1"), { state: "generating" });
  assert.deepEqual(await p.status("r1"), { state: "generating" });
  assert.deepEqual(await p.status("r1"), { state: "failed", error: "http_404" });
  assert.deepEqual(await p.status("r1"), { state: "failed", error: "reponse_invalide" });
  assert.deepEqual(inconnus, ["in_progress"]);
});

test("bout en bout avec runGeneration : soumission unique, sondage, image rendue", async () => {
  const { t, calls } = transport([
    { status: 200, json: { status: "queued", request_id: "req_9" } },
    { status: 200, json: { status: "queued" } },
    { status: 200, json: { status: "completed", images: [{ url: "https://cdn.higgsfield.test/9.png" }] } },
  ]);
  const journal: string[] = [];
  const r = await runGeneration(createHiggsfieldProvider(CFG, { transport: t }),
    { idempotencyKey: "k9", brief: briefs()[1], referenceImageUrl: PHOTO },
    { journal: (e) => journal.push(`${e.de}>${e.vers}`), sleep: async () => {} });
  assert.deepEqual(r, { state: "completed", imageUrl: "https://cdn.higgsfield.test/9.png", providerRef: "req_9" });
  assert.equal(calls.filter((c) => c.method === "POST").length, 1);
  assert.deepEqual(journal, ["requested>generating", "generating>completed"]);
});

test("discipline : aucune lecture d'environnement ni clé en dur dans le module", () => {
  const src = readFileSync("lib/creative/providers/higgsfield.ts", "utf8");
  assert.doesNotMatch(src, /process\.env/);
  assert.doesNotMatch(src, /NEXT_PUBLIC_/);
  assert.match(src, /enhance_prompt: false,/);
});
