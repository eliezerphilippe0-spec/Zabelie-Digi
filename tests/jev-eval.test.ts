import test from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseLabeledCsv, parseCsvRows } from "../scripts/jev-eval/csv";
import { buildBody, configFromEnv, decide, DEFAULT_ENDPOINT, type JevConfig } from "../lib/jev/client";
import { percentile, summarize, type EvalRecord } from "../scripts/jev-eval/metrics";
import { redactForJev, type Redacted } from "../lib/jev/redact";
import { renderReport } from "../scripts/jev-eval/report";
import { assertDatasetNotTracked, maxCalls } from "../scripts/jev-eval/run";
import { INTENTS } from "../lib/jev/taxonomy";

/**
 * Harnais d'évaluation Jev (docs/61, Phase 1). Chaque garde est passé sur un
 * cas connu-positif ET un cas connu-négatif (CLAUDE.md, « un instrument non
 * éprouvé ne prouve rien »). Aucun appel réseau : transport injecté.
 */

const SEVEN_DIGITS = /\d(?:[\s.-]?\d){6,}/;

// ── Redaction ────────────────────────────────────────────────────────────────

test("redaction : téléphones, transactions, commandes, courriels, liens, UUID sont masqués", () => {
  const cases: [string, string][] = [
    ["Rele m nan +509 3737-6615 souple", "[NIMEWO]"],
    ["nimewo m se 37376615", "[NIMEWO]"],
    ["WhatsApp: 3737 6615", "[NIMEWO]"],
    ["(509) 3737.6615", "[NIMEWO]"],
    ["Tranzaksyon MonCash 2000123456789 pa pase", "[NIMEWO]"],
    ["Kòmand ZB-250923-ACD7K poko rive", "[KOMAND]"],
    ["kòmand zb-250923-acd7k", "[KOMAND]"],
    ["ZB 250923 ACD7K", "[KOMAND]"],
    ["ekri m sou jan.pye@example.com", "[IMEL]"],
    ["gade https://zabelie.com/facture/abc123token", "[LYEN]"],
    ["id 3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b", "[ID]"],
  ];
  for (const [raw, token] of cases) {
    const r = redactForJev(raw);
    assert.ok(r.text.includes(token), `${raw} → ${r.text}`);
    assert.doesNotMatch(r.text, SEVEN_DIGITS, raw);
  }
});

test("redaction : noms après une formule de présentation, accent initial compris", () => {
  // `Élodie` : accent en PREMIÈRE lettre, le cas où une frontière ASCII tombe.
  for (const [raw, leaked] of [
    ["Bonjou, mwen rele Jan Pyè", "Jan"],
    ["Je m'appelle Élodie Fanfan", "Élodie"],
    ["my name is marie", "marie"],
    ["Non mwen se Wilnè", "Wilnè"],
  ]) {
    const r = redactForJev(raw);
    assert.ok(r.text.includes("[NON]"), `${raw} → ${r.text}`);
    assert.ok(!r.text.includes(leaked), `${raw} → ${r.text}`);
    assert.equal(r.counts.non, 1);
  }
});

test("redaction, cas négatifs : montants, dates, kreyòl accentué et « rele » verbe intacts", () => {
  for (const raw of [
    "Mwen peye 1500 goud men li pa pase",
    "25 000 HTG debite",
    "Mwen te achte l 23/09/2026",
    "Vandè a pa reponn mwen, kòmand lan pa rive, sa fè lè",
    "m rele sèvis la 3 fwa",
    "Kòd ZB-2509 la pa mache",
  ]) {
    const r = redactForJev(raw);
    assert.equal(r.text, raw.normalize("NFC"), raw);
    assert.deepEqual(Object.values(r.counts).reduce((a, b) => a + b, 0), 0, raw);
  }
});

test("redaction idempotente", () => {
  const once = redactForJev("mwen rele Jan, +509 3737 6615, ZB-250923-ACD7K").text;
  assert.equal(redactForJev(once).text, once);
});

// ── Client : état redacté obligatoire ───────────────────────────────────────

const config: JevConfig = { apiKey: "test-only-value", endpoint: DEFAULT_ENDPOINT, model: "jev-latest", timeoutMs: 50 };
const valid = {
  model: "jev-1.13",
  answers: {
    entansyon: { type: "choice", choice: "pwoblem_peman", confidence: 0.82 },
    eskalade: { type: "noul", noul: 0.91 },
    ijans: { type: "noul", noul: 0.4 },
  },
};
const noSleep = async () => undefined;

test("le client REFUSE un état non passé par la redaction, sans appeler le fournisseur", async () => {
  let calls = 0;
  const fetcher: typeof fetch = async () => { calls++; return Response.json(valid); };
  const forged = [
    "Mwen peye, rele m 37376615",
    { text: "Mwen peye, rele m 37376615" },
    { text: "x", counts: {} },
    { ...redactForJev("x") },
    // La vraie contrefaçon : copie d'un objet redacté, texte brut réinjecté.
    { ...redactForJev("x"), text: "Mwen peye, rele m 37376615" },
  ];
  for (const f of forged) {
    await assert.rejects(decide(f as unknown as Redacted, config, { fetcher }), { message: "etat_non_redacte" });
    assert.throws(() => buildBody(f as unknown as Redacted, "jev-latest"), { message: "etat_non_redacte" });
  }
  assert.equal(calls, 0);
});

test("le client envoie le texte redacté, l'endpoint et le modèle configurés, sans redirection", async () => {
  const other: JevConfig = { ...config, endpoint: "https://openrouter.example/api/alpha/decisions", model: "typesafe/jev-latest" };
  const result = await decide(redactForJev("Mwen peye 1500 goud, rele m +509 3737-6615"), other, {
    fetcher: async (url, init) => {
      assert.equal(url, other.endpoint);
      assert.equal(init?.redirect, "error");
      assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer test-only-value");
      const body = JSON.parse(init?.body as string);
      assert.equal(body.model, "typesafe/jev-latest");
      assert.equal(body.state.untrusted_customer_message, "Mwen peye 1500 goud, rele m [NIMEWO]");
      assert.deepEqual(Object.keys(body.questions), ["entansyon", "eskalade", "ijans"]);
      assert.deepEqual(Object.keys(body.questions.entansyon.criteria), [...INTENTS]);
      assert.doesNotMatch(init?.body as string, /3737/);
      return Response.json({ ...valid, usage: { cost: 0.0000021 } });
    },
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.entansyon, "pwoblem_peman");
  assert.equal(result.confidence, 0.82);
  assert.equal(result.eskaladeP, 0.91);
  assert.equal(result.ijansP, 0.4);
  assert.equal(result.model, "jev-1.13");
  assert.equal(result.costUsd, 0.0000021);
  assert.equal(result.attempts, 1);
});

test("réponse hors schéma ou hors taxonomie = invalid_response, jamais un chiffre", async () => {
  const bad = [
    { answers: {} },
    { answers: { ...valid.answers, entansyon: { ...valid.answers.entansyon, choice: "release_funds" } } },
    { answers: { ...valid.answers, eskalade: { type: "noul", noul: 2 } } },
    { answers: { entansyon: valid.answers.entansyon, eskalade: valid.answers.eskalade } },
  ];
  for (const b of bad) {
    const r = await decide(redactForJev("bonjou"), config, { fetcher: async () => Response.json(b) });
    assert.deepEqual([r.ok, !r.ok && r.reason], [false, "invalid_response"]);
  }
  const text = await decide(redactForJev("bonjou"), config, { fetcher: async () => new Response("not json") });
  assert.deepEqual([text.ok, !text.ok && text.reason], [false, "invalid_response"]);
});

test("relance bornée : 429/529 relancés au plus deux fois, 500 jamais, corps d'erreur jamais remonté", async () => {
  const waits: number[] = [];
  const sleep = async (ms: number) => { waits.push(ms); };
  let n = 0;
  const once429 = await decide(redactForJev("x"), config, {
    sleep,
    fetcher: async () => (n++ === 0 ? new Response("", { status: 429, headers: { "retry-after": "3" } }) : Response.json(valid)),
  });
  assert.equal(once429.ok, true);
  assert.equal(once429.attempts, 2);
  assert.deepEqual(waits, [3000]);

  waits.length = 0; n = 0;
  const always529 = await decide(redactForJev("x"), config, {
    sleep, fetcher: async () => { n++; return new Response("secret provider body", { status: 529 }); },
  });
  assert.deepEqual([always529.ok, !always529.ok && always529.reason, always529.attempts, n], [false, "http_529", 3, 3]);
  assert.deepEqual(waits, [1000, 2000]);
  assert.doesNotMatch(JSON.stringify(always529), /secret/);

  n = 0;
  const e500 = await decide(redactForJev("x"), config, { sleep: noSleep, fetcher: async () => { n++; return new Response("", { status: 500 }); } });
  assert.deepEqual([e500.ok, !e500.ok && e500.reason, n], [false, "http_500", 1]);
});

test("délai dépassé = timeout, sans nouvelle tentative", async () => {
  let n = 0;
  const r = await decide(redactForJev("x"), config, {
    fetcher: (_u, init) => { n++; return new Promise((_res, rej) => init?.signal?.addEventListener("abort", () => rej(new Error("aborted")))); },
  });
  assert.deepEqual([r.ok, !r.ok && r.reason, n], [false, "timeout", 1]);
});

test("configuration : clé obligatoire, https sans identifiants, défauts TypeSafe direct", () => {
  assert.throws(() => configFromEnv({}), /config_cle_absente/);
  assert.throws(() => configFromEnv({ TYPESAFE_API_KEY: "k", JEV_BASE_URL: "http://api.typesafe.ai/v1/systemone" }), /config_endpoint_invalide/);
  assert.throws(() => configFromEnv({ TYPESAFE_API_KEY: "k", JEV_BASE_URL: "https://u:p@evil.test/x" }), /config_endpoint_invalide/);
  assert.throws(() => configFromEnv({ TYPESAFE_API_KEY: "k", JEV_TIMEOUT_MS: "10" }), /config_timeout_invalide/);
  assert.deepEqual(configFromEnv({ TYPESAFE_API_KEY: " k " }), { apiKey: "k", endpoint: DEFAULT_ENDPOINT, model: "jev-latest", timeoutMs: 8000 });
});

// ── CSV ──────────────────────────────────────────────────────────────────────

test("CSV : guillemets, virgules, retours à la ligne, BOM et CRLF", () => {
  const csv = "﻿message,entansyon,eskalade,ijans\r\n" +
    "\"Bonjou, mwen peye\nmen \"\"anyen\"\" pa rive\",pwoblem_peman,WI,non\r\n" +
    "Kote kòmand mwen?,swivi_komand,non,non\r\n";
  const rows = parseLabeledCsv(csv);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].message, "Bonjou, mwen peye\nmen \"anyen\" pa rive");
  assert.deepEqual([rows[0].entansyon, rows[0].eskalade, rows[0].ijans], ["pwoblem_peman", "wi", "non"]);
  assert.equal(rows[1].line, 4);
  assert.equal(parseCsvRows("a,b\n\n").length, 1);
});

test("CSV : toute étiquette hors taxonomie arrête la lecture avec sa ligne", () => {
  const head = "message,entansyon,eskalade,ijans\n";
  assert.throws(() => parseLabeledCsv("msg,intent,esc,urg\nx,lot,wi,non\n"), /csv_entete_invalide/);
  assert.throws(() => parseLabeledCsv(head), /csv_vide/);
  // `vandè` accentué : l'identifiant est ASCII (`vande`), l'accent doit être refusé, pas ignoré.
  assert.throws(() => parseLabeledCsv(`${head}x,vandè,non,non\n`), /csv_entansyon_inconnue ligne 2/);
  assert.throws(() => parseLabeledCsv(`${head}x,lot,oui,non\n`), /csv_eskalade_invalide ligne 2/);
  assert.throws(() => parseLabeledCsv(`${head}x,lot,wi\n`), /csv_colonnes ligne 2/);
  assert.throws(() => parseLabeledCsv(`${head},lot,wi,non\n`), /csv_message_vide/);
  assert.throws(() => parseLabeledCsv(`${head}"x,lot,wi,non\n`), /csv_guillemet_non_ferme/);
  assert.equal(parseLabeledCsv(`${head}x,vande,non,non\n`)[0].entansyon, "vande");
});

// ── Métriques : jeu connu, chiffres attendus calculés à la main ─────────────

function rec(line: number, truth: string, esk: "wi" | "non", result: EvalRecord["result"]): EvalRecord {
  return { item: { line, message: `m${line}`, entansyon: truth as never, eskalade: esk, ijans: "non" }, redacted: `m${line}`, result };
}
const ok = (entansyon: string, confidence: number, eskaladeP: number, latencyMs: number) =>
  ({ ok: true as const, entansyon: entansyon as never, confidence, eskaladeP, ijansP: 0.1, model: null, costUsd: null, latencyMs, attempts: 1 });
const known: EvalRecord[] = [
  rec(2, "swivi_komand", "wi", ok("swivi_komand", 0.95, 0.9, 100)),
  rec(3, "pwoblem_peman", "wi", ok("lot", 0.6, 0.2, 200)),           // escalade ratée + intention fausse
  rec(4, "kesyon_pwodwi", "non", ok("kesyon_pwodwi", 0.8, 0.4, 300)), // fausse alerte à 0,3 seulement
  rec(5, "ranbousman", "wi", { ok: false, reason: "timeout", latencyMs: 400, attempts: 1 }),
];

test("métriques sur un jeu connu : précision, rappel d'escalade, calibration, matrice, latence", () => {
  const s = summarize(known);
  assert.equal(s.intentAccuracy, 0.5);
  assert.equal(s.intentAccuracyAnswered, 2 / 3);
  const at = (t: number) => s.escalation.find((e) => e.threshold === t)!;
  assert.deepEqual(
    [at(0.5).positives, at(0.5).caught, at(0.5).caughtByFailure, at(0.5).missed, at(0.5).falseAlerts],
    [3, 2, 1, 1, 0],
  );
  assert.deepEqual([at(0.3).caught, at(0.3).falseAlerts], [2, 1]);
  assert.deepEqual([at(0.7).caught, at(0.7).missed], [2, 1]);
  assert.deepEqual(s.calibration.map((b) => [b.n, b.accuracy]), [[0, null], [1, 0], [1, 1], [1, 1]]);
  const row = (t: string) => s.confusion.rows.find((r) => r.truth === t)!.row;
  assert.equal(row("pwoblem_peman")[s.confusion.columns.indexOf("lot")], 1);
  assert.equal(row("ranbousman")[s.confusion.columns.indexOf("echec")], 1);
  assert.deepEqual(s.latency, { p50: 200, p95: 400 });
  assert.deepEqual(s.failures, { timeout: 1 });
  assert.deepEqual(s.worst.map((r) => r.item.line), [3, 5]);
  const peman = s.perIntent.find((i) => i.intent === "pwoblem_peman")!;
  assert.deepEqual([peman.support, peman.tp, peman.recall], [1, 0, 0]);
  assert.equal(percentile([], 50), null);
});

test("rapport : seuls les messages REDACTÉS apparaissent, coût absent signalé", () => {
  const r = redactForJev("Mwen rele Jan, +509 3737-6615, kòb mwen pa pase");
  const record: EvalRecord = {
    item: { line: 2, message: "Mwen rele Jan, +509 3737-6615, kòb mwen pa pase", entansyon: "pwoblem_peman", eskalade: "wi", ijans: "wi" },
    redacted: r.text,
    result: ok("lot", 0.7, 0.1, 120),
  };
  const md = renderReport(summarize([record]), { date: "2026-09-23", endpoint: DEFAULT_ENDPOINT, model: "jev-latest", dataset: "jev-eval-data/x.csv" });
  assert.ok(md.includes("[NIMEWO]"));
  assert.doesNotMatch(md, /3737|Jan,/);
  assert.match(md, /Coût non rendu par l'API/);
  assert.match(md, /sous les 150 prévus/);
  assert.match(md, /Aucun seuil d'acceptation/);
});

// ── Confinement et hygiène ──────────────────────────────────────────────────

test("le jeu réel ne peut pas être commité : CSV du dépôt non ignoré refusé", () => {
  assert.doesNotThrow(() => assertDatasetNotTracked("jev-eval-data/messages.csv"));
  assert.doesNotThrow(() => assertDatasetNotTracked("scripts/jev-eval/messages.csv"));
  assert.doesNotThrow(() => assertDatasetNotTracked(join(tmpdir(), "messages.csv")));
  assert.throws(() => assertDatasetNotTracked("tests/messages.csv"), /jeu_non_ignore/);
  assert.throws(() => assertDatasetNotTracked("messages.csv"), /jeu_non_ignore/);
});

test("plafond d'appels facturables", () => {
  assert.equal(maxCalls({}), 250);
  assert.equal(maxCalls({ JEV_EVAL_MAX: "200" }), 200);
  for (const v of ["0", "abc", "5000", "1.5"]) assert.throws(() => maxCalls({ JEV_EVAL_MAX: v }), /config_max_invalide/);
});
