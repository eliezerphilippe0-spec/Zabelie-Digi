import type { EvalSummary } from "./metrics";

/**
 * Rendu Markdown. Le rapport contient les messages REDACTÉS des pires erreurs :
 * il s'écrit dans `agent-reports/` (ignoré par Git), jamais dans le dépôt.
 */
const pct = (v: number | null) => (v === null ? "—" : `${(v * 100).toFixed(1)} %`);
const num = (v: number | null, d = 2) => (v === null ? "—" : v.toFixed(d));
const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/\s+/g, " ");

export function renderReport(s: EvalSummary, meta: { date: string; endpoint: string; model: string; dataset: string }): string {
  const out: string[] = [];
  out.push(`# Évaluation Jev — triage kreyòl (${meta.date})`, "");
  out.push("> Chiffres bruts. **Aucun seuil d'acceptation n'est appliqué** : la décision revient au porteur.", "");
  out.push(`- Jeu : \`${meta.dataset}\` — ${s.n} messages, ${s.answered} classés, ${s.n - s.answered} échecs`);
  out.push(`- Endpoint : \`${meta.endpoint}\` · modèle demandé \`${meta.model}\` · modèles rendus : ${s.models.map((m) => `\`${m}\``).join(", ") || "—"}`);
  if (s.n < 150) out.push(`- ⚠️ **${s.n} messages, sous les 150 prévus** : les pourcentages par intention sont peu fiables.`);
  const failures = Object.entries(s.failures);
  if (failures.length) out.push(`- Échecs : ${failures.map(([k, v]) => `${k} × ${v}`).join(", ")}`);
  out.push("");

  out.push("## 1. Rappel sur `eskalade = wi` (métrique principale)", "");
  out.push("Un échec d'appel compte comme escaladé (file humaine en Phase 2) ; la colonne dédiée dit combien.", "");
  out.push("| Seuil p(wi) | Positifs | Rattrapés | dont par échec | **Ratés** | Rappel | Fausses alertes | Précision |", "|---|---|---|---|---|---|---|---|");
  for (const e of s.escalation) {
    out.push(`| ≥ ${num(e.threshold, 1)} | ${e.positives} | ${e.caught} | ${e.caughtByFailure} | **${e.missed}** | ${pct(e.recall)} | ${e.falseAlerts} | ${pct(e.precision)} |`);
  }
  out.push("");

  out.push("## 2. Intention", "");
  out.push(`- Précision globale (échecs = erreurs) : **${pct(s.intentAccuracy)}**`);
  out.push(`- Précision sur les seuls messages classés : ${pct(s.intentAccuracyAnswered)}`, "");
  out.push("| Intention | Effectif | Prédits | Justes | Précision | Rappel |", "|---|---|---|---|---|---|");
  for (const i of s.perIntent) out.push(`| \`${i.intent}\` | ${i.support} | ${i.predicted} | ${i.tp} | ${pct(i.precision)} | ${pct(i.recall)} |`);
  out.push("", "### Matrice de confusion (ligne = étiquette, colonne = Jev)", "");
  out.push(`| | ${s.confusion.columns.map((c) => `\`${c}\``).join(" | ")} |`);
  out.push(`|---|${s.confusion.columns.map(() => "---").join("|")}|`);
  for (const r of s.confusion.rows) out.push(`| \`${r.truth}\` | ${r.row.join(" | ")} |`);
  out.push("");

  out.push("## 3. Calibration de la confiance d'intention", "");
  out.push("| Tranche | Messages | Confiance moyenne | Précision observée |", "|---|---|---|---|");
  for (const b of s.calibration) out.push(`| ${b.label} | ${b.n} | ${num(b.meanConfidence)} | ${pct(b.accuracy)} |`);
  out.push("");

  out.push("## 4. Urgence (`ijans = wi`)", "");
  out.push("| Seuil p(wi) | Positifs | Rattrapés | Ratés | Rappel | Fausses alertes | Précision |", "|---|---|---|---|---|---|---|");
  for (const e of s.urgency) out.push(`| ≥ ${num(e.threshold, 1)} | ${e.positives} | ${e.caught} | ${e.missed} | ${pct(e.recall)} | ${e.falseAlerts} | ${pct(e.precision)} |`);
  out.push("");

  out.push("## 5. Latence et coût", "");
  out.push(`- Latence de bout en bout (relances comprises) : p50 **${num(s.latency.p50, 0)} ms**, p95 **${num(s.latency.p95, 0)} ms**`);
  out.push(`- Tentatives HTTP : ${s.attempts} pour ${s.n} messages`);
  out.push(s.cost.callsWithCost
    ? `- Coût rendu par l'API : **${s.cost.totalUsd.toFixed(6)} USD** sur ${s.cost.callsWithCost} appels${s.cost.callsWithoutCost ? ` (${s.cost.callsWithoutCost} sans coût rendu)` : ""}`
    : "- ⚠️ **Coût non rendu par l'API** : le coût réel se lit dans le tableau de bord du fournisseur. Ne pas lire « 0 ».");
  out.push("");

  out.push(`## 6. Les ${s.worst.length} pires erreurs (relecture humaine)`, "");
  out.push("Ordre : escalades ratées d'abord (p(wi) croissante), puis intentions fausses (confiance décroissante), puis échecs.", "");
  out.push("| Ligne CSV | Message (redacté) | Étiquette | Jev | Conf. | p(eskalade) | eskalade attendue |", "|---|---|---|---|---|---|---|");
  for (const r of s.worst) {
    const msg = cell(r.redacted.length > 200 ? `${r.redacted.slice(0, 200)}…` : r.redacted);
    const jev = r.result.ok ? `\`${r.result.entansyon}\`` : `échec : ${r.result.reason}`;
    out.push(`| ${r.item.line} | ${msg} | \`${r.item.entansyon}\` | ${jev} | ${r.result.ok ? num(r.result.confidence) : "—"} | ${r.result.ok ? num(r.result.eskaladeP) : "—"} | ${r.item.eskalade} |`);
  }
  out.push("");
  return out.join("\n");
}
