import type { LabeledMessage } from "./csv";
import type { JevDecision, JevFailure } from "./jev-client";
import { INTENTS, WI, type Intent } from "./taxonomy";

/**
 * Métriques — fonctions pures, aucun appel réseau, aucun seuil d'acceptation.
 *
 * Deux conventions, écrites ici parce qu'elles changent les chiffres :
 *
 * 1. Un ÉCHEC d'appel (délai, HTTP, réponse invalide) compte comme une ERREUR
 *    d'intention : un message non classé n'est pas un message bien classé.
 * 2. Pour `eskalade` et `ijans`, un échec compte comme « wi » : en Phase 2 un
 *    échec part en file humaine (échec sûr). Le rapport dit combien de
 *    rattrapages viennent de là, pour que ça ne se lise pas comme du mérite.
 *
 * Les seuils de décision (0,3 / 0,5 / 0,7) sont affichés CÔTE À CÔTE : le choix
 * revient au porteur, pas au script.
 */
export type EvalRecord = { item: LabeledMessage; redacted: string; result: JevDecision | JevFailure };

export const THRESHOLDS = [0.3, 0.5, 0.7] as const;
export const BUCKETS: { label: string; min: number; max: number }[] = [
  { label: "< 0,5", min: 0, max: 0.5 },
  { label: "0,5 – 0,7", min: 0.5, max: 0.7 },
  { label: "0,7 – 0,9", min: 0.7, max: 0.9 },
  { label: "≥ 0,9", min: 0.9, max: Infinity },
];
export const FAIL = "echec" as const;

export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)];
}

const ratio = (a: number, b: number) => (b === 0 ? null : a / b);

export function binaryAtThresholds(records: EvalRecord[], field: "eskalade" | "ijans") {
  const positives = records.filter((r) => r.item[field] === WI);
  const negatives = records.filter((r) => r.item[field] !== WI);
  const p = (r: EvalRecord) => (r.result.ok ? (field === "eskalade" ? r.result.eskaladeP : r.result.ijansP) : null);
  return THRESHOLDS.map((t) => {
    const flagged = (r: EvalRecord) => { const v = p(r); return v === null || v >= t; };
    const caught = positives.filter(flagged);
    const caughtByFailure = caught.filter((r) => !r.result.ok).length;
    const falseAlerts = negatives.filter(flagged).length;
    return {
      threshold: t,
      positives: positives.length,
      caught: caught.length,
      caughtByFailure,
      missed: positives.length - caught.length,
      recall: ratio(caught.length, positives.length),
      falseAlerts,
      precision: ratio(caught.length, caught.length + falseAlerts),
    };
  });
}

export function summarize(records: EvalRecord[]) {
  const n = records.length;
  const answered = records.filter((r) => r.result.ok) as (EvalRecord & { result: JevDecision })[];
  const predicted = (r: EvalRecord): Intent | typeof FAIL => (r.result.ok ? r.result.entansyon : FAIL);
  const correct = records.filter((r) => predicted(r) === r.item.entansyon).length;

  const failures: Record<string, number> = {};
  for (const r of records) if (!r.result.ok) failures[r.result.reason] = (failures[r.result.reason] ?? 0) + 1;

  const perIntent = INTENTS.map((intent) => {
    const support = records.filter((r) => r.item.entansyon === intent).length;
    const predictedCount = records.filter((r) => predicted(r) === intent).length;
    const tp = records.filter((r) => r.item.entansyon === intent && predicted(r) === intent).length;
    return { intent, support, predicted: predictedCount, tp, precision: ratio(tp, predictedCount), recall: ratio(tp, support) };
  });

  const columns = [...INTENTS, FAIL] as const;
  const confusion = INTENTS.map((truth) => ({
    truth,
    row: columns.map((pred) => records.filter((r) => r.item.entansyon === truth && predicted(r) === pred).length),
  }));

  const calibration = BUCKETS.map((b) => {
    const inBucket = answered.filter((r) => r.result.confidence >= b.min && r.result.confidence < b.max);
    const ok = inBucket.filter((r) => r.result.entansyon === r.item.entansyon).length;
    const meanConfidence = inBucket.length ? inBucket.reduce((s, r) => s + r.result.confidence, 0) / inBucket.length : null;
    return { label: b.label, n: inBucket.length, accuracy: ratio(ok, inBucket.length), meanConfidence };
  });

  const latencies = records.map((r) => r.result.latencyMs);
  const costs = answered.map((r) => r.result.costUsd);
  const withCost = costs.filter((c): c is number => c !== null);

  const missedEsc = (r: EvalRecord) => r.item.eskalade === WI && r.result.ok && r.result.eskaladeP < 0.5;
  const intentWrong = (r: EvalRecord) => r.result.ok && r.result.entansyon !== r.item.entansyon;
  const worst = records
    .filter((r) => !r.result.ok || intentWrong(r) || missedEsc(r))
    .sort((a, b) => {
      const rank = (r: EvalRecord) => (missedEsc(r) ? 0 : intentWrong(r) ? 1 : 2);
      if (rank(a) !== rank(b)) return rank(a) - rank(b);
      if (a.result.ok && b.result.ok) {
        return rank(a) === 0 ? a.result.eskaladeP - b.result.eskaladeP : b.result.confidence - a.result.confidence;
      }
      return a.item.line - b.item.line;
    })
    .slice(0, 20);

  return {
    n,
    answered: answered.length,
    failures,
    intentAccuracy: ratio(correct, n),
    intentAccuracyAnswered: ratio(answered.filter((r) => r.result.entansyon === r.item.entansyon).length, answered.length),
    perIntent,
    confusion: { columns: [...columns], rows: confusion },
    escalation: binaryAtThresholds(records, "eskalade"),
    urgency: binaryAtThresholds(records, "ijans"),
    calibration,
    latency: { p50: percentile(latencies, 50), p95: percentile(latencies, 95) },
    cost: { totalUsd: withCost.reduce((s, c) => s + c, 0), callsWithCost: withCost.length, callsWithoutCost: costs.length - withCost.length },
    attempts: records.reduce((s, r) => s + r.result.attempts, 0),
    models: [...new Set(answered.map((r) => r.result.model ?? "non fourni"))],
    worst,
  };
}
export type EvalSummary = ReturnType<typeof summarize>;
