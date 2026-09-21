import { mkdir, writeFile, appendFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";

// Fixed destinations: no URL, command, credential or customer data supplied by Jev.
const SITE = "https://zabelie.com";
const REPO = "eliezerphilippe0-spec/Zabelie-Digi";
const API = `https://api.github.com/repos/${REPO}`;
const PRIORITIES = ["P0", "P1", "P2", "P3"];
const RUNBOOKS = {
  observe: "Aucune correction proposée. Continuer la surveillance.",
  application: "Examiner les erreurs Vercel et le dernier déploiement. Préparer un correctif sur une branche séparée, tester puis demander validation.",
  database: "Examiner la disponibilité de la base et les erreurs de connexion. Ne pas modifier les données ni rejouer de migration automatiquement.",
  access: "Vérifier les permissions et la session administrateur dans un environnement isolé. Aucun contournement d’authentification.",
  ci: "Consulter la CI du commit concerné, reproduire le test échoué et préparer une correction pour revue. Aucun merge automatique.",
  deployment: "Vérifier si un déploiement est en cours et comparer les versions. Ne pas promouvoir une ancienne version automatiquement.",
  agent: "Vérifier les accès de supervision et le secret TypeSafe. Ne jamais recopier une clé dans les logs ou le rapport.",
};
const PROBES = [
  { id: "home", path: "/", method: "GET", kind: "html", runbook: "application" },
  { id: "health", path: "/api/health", method: "GET", kind: "health", runbook: "application" },
  { id: "database", path: "/api/readyz", method: "GET", kind: "ready", runbook: "database" },
  { id: "deployment", path: "/api/deployment", method: "GET", kind: "release", runbook: "deployment" },
  // Empty request, never a payment/customer operation. Success here is NOT expected.
  { id: "access", path: "/api/admin/jev", method: "POST", kind: "denied", runbook: "access" },
];

async function boundedText(response, limit) {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) { await reader.cancel(); throw new Error("response_too_large"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks).toString("utf8");
}

async function request(url, { fetcher, headers = {}, method = "GET", body, json = true, limit = 32768, timeoutMs = 12000 }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(url, {
      method, headers, body, redirect: "error", cache: "no-store", signal: controller.signal,
    });
    const text = await boundedText(response, limit);
    return { status: response.status, data: json ? JSON.parse(text) : text };
  } finally { clearTimeout(timer); }
}

// A 401/403 alone proves nothing: a proxy, WAF, edge firewall or deployment
// protection answers the same way without the request ever reaching Zabelie.
// Only an application-shaped refusal counts — the {error: "…"} body that
// erreurTraduite() renders. The message itself is TRANSLATED, so never match
// its text; assert the shape. Anything else stays inconclusive, never a pass.
function refusApplicatif(texte) {
  try {
    const corps = JSON.parse(texte);
    return typeof corps?.error === "string" && corps.error.trim().length > 0;
  } catch { return false; }
}

function validProbe(probe, response, now) {
  if (probe.kind === "denied") return [401, 403].includes(response.status) && refusApplicatif(response.data);
  if (response.status !== 200) return false;
  const data = response.data;
  if (probe.kind === "html") return /<html[\s>]/i.test(data) && /zabelie/i.test(data);
  if (probe.kind === "health") return data?.ok === true && Number.isFinite(Date.parse(data.time)) && Math.abs(now() - Date.parse(data.time)) < 300000;
  if (probe.kind === "ready") return data?.ok === true && Number.isFinite(data.latencyMs) && data.latencyMs >= 0;
  if (probe.kind === "release") return /^[a-f0-9]{64}$/.test(data?.release ?? "");
  return false;
}

export async function probeSite({ fetcher = fetch, now = Date.now, timeoutMs = 12000 } = {}) {
  const checks = [];
  let release;
  for (const probe of PROBES) {
    let passed = false;
    let status = null;
    let attempts = 0;
    let durationMs = 0;
    // Only GET requests may be retried. No automated retry of any POST.
    const maximum = probe.method === "GET" ? 2 : 1;
    while (!passed && attempts < maximum) {
      attempts++;
      const start = now();
      try {
        const response = await request(SITE + probe.path, {
          fetcher, method: probe.method, timeoutMs,
          headers: { "Content-Type": "application/json", Origin: SITE, "Cache-Control": "no-cache" },
          body: probe.method === "POST" ? "{}" : undefined,
          json: !["html", "denied"].includes(probe.kind),
          limit: probe.kind === "html" ? 2_000_000 : 32768,
        });
        status = response.status;
        passed = validProbe(probe, response, now);
        if (passed && probe.kind === "release") release = response.data.release;
      } catch { status = null; }
      durationMs = Math.max(0, now() - start);
    }
    // A timeout/404/5xx is not proof that access was granted. Only a 2xx
    // response to the unauthenticated POST raises the access-control alarm.
    const inconclusiveAccess = probe.kind === "denied" && !passed && (status === null || status < 200 || status >= 300);
    checks.push({
      id: probe.id, status: passed ? (attempts > 1 || durationMs > 5000 ? "warning" : "pass") : inconclusiveAccess ? "unknown" : "fail",
      httpStatus: status, attempts, durationMs, runbook: probe.runbook,
    });
  }
  return { checks, release };
}

export async function inspectCI({ fetcher = fetch, githubToken = "", timeoutMs = 12000 } = {}) {
  const headers = { Accept: "application/vnd.github+json", "User-Agent": "Zabelie-Supervisor" };
  if (githubToken) headers.Authorization = `Bearer ${githubToken}`;
  try {
    const head = await request(`${API}/commits/main`, { fetcher, headers, timeoutMs, limit: 2_000_000 });
    if (head.status !== 200 || !/^[a-f0-9]{40}$/.test(head.data?.sha ?? "")) throw new Error("ci_unavailable");
    const runs = await request(`${API}/actions/workflows/ci.yml/runs?branch=main&event=push&per_page=10`, { fetcher, headers, timeoutMs, limit: 2_000_000 });
    if (runs.status !== 200 || !Array.isArray(runs.data?.workflow_runs)) throw new Error("ci_unavailable");
    const run = runs.data.workflow_runs.find((item) => item.head_sha === head.data.sha);
    const status = !run ? "unknown" : run.status !== "completed" ? "pending" : run.conclusion === "success" ? "pass" : "fail";
    return { id: "ci", status, runbook: "ci", commit: head.data.sha };
  } catch { return { id: "ci", status: "unknown", runbook: "agent" }; }
}

function deterministicPriority(checks) {
  if (checks.some((c) => c.status === "fail" && c.id === "access")) return "P0";
  if (checks.some((c) => c.status === "fail")) return "P1";
  if (checks.some((c) => c.status !== "pass")) return "P2";
  return "P3";
}

export async function evaluateWithJev(checks, { fetcher = fetch, key = "", timeoutMs = 8000 } = {}) {
  if (!key.trim()) return { status: "not_configured" };
  // Project only known machine values. Never forward HTML, error text, credentials or code.
  const safeChecks = checks.map(({ id, status }) => ({ id, status }));
  try {
    const response = await request("https://api.typesafe.ai/v1/systemone", {
      fetcher, timeoutMs, method: "POST",
      headers: { Authorization: `Bearer ${key.trim()}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "jev-latest", state: JSON.stringify({ checks: safeChecks }),
        questions: {
          priority: { type: "choice", instructions: "Prioritize these monitoring signals, not a complete audit. Unknown and pending mean unverified, not healthy. Failure of access means a suspected authorization issue requiring urgent HUMAN review, not proof of exploitation.", criteria: { P0: "Suspected access-control incident", P1: "Availability or CI failure", P2: "Incomplete evidence, pending deployment or recovered transient failure", P3: "All sampled checks pass" } },
          runbook: { type: "choice", instructions: "Choose the first HUMAN investigation playbook supported by the checks. Do not infer a root cause or claim a repair.", criteria: RUNBOOKS },
        },
      }),
    });
    if (response.status !== 200) throw new Error("jev_unavailable");
    const priority = response.data?.answers?.priority;
    const runbook = response.data?.answers?.runbook;
    const valid = (answer, choices) => answer?.type === "choice" && choices.includes(answer.choice) && Number.isFinite(answer.confidence) && answer.confidence >= 0 && answer.confidence <= 1;
    if (!valid(priority, PRIORITIES) || !valid(runbook, Object.keys(RUNBOOKS))) throw new Error("invalid_jev_response");
    return { status: "ok", priority: priority.choice, runbook: runbook.choice, confidence: Math.min(priority.confidence, runbook.confidence) };
  } catch { return { status: "unavailable" }; }
}

export async function supervise({ fetcher = fetch, key = "", githubToken = "", now = Date.now, timeoutMs = 12000 } = {}) {
  const start = now();
  const site = await probeSite({ fetcher, now, timeoutMs });
  const ci = await inspectCI({ fetcher, githubToken, timeoutMs });
  const checks = [...site.checks, ci];
  if (site.release && ci.commit) {
    checks.push({ id: "release_alignment", status: createHash("sha256").update(ci.commit).digest("hex") === site.release ? "pass" : "warning", runbook: "deployment" });
  }
  const jev = await evaluateWithJev(checks, { fetcher, key, timeoutMs: Math.min(timeoutMs, 8000) });
  if (jev.status !== "ok") checks.push({ id: "jev", status: "unknown", runbook: "agent" });
  const baseline = deterministicPriority(checks);
  // Jev may elevate a priority; it can NEVER downgrade a deterministic alarm.
  const priority = jev.status === "ok" && jev.confidence >= 0.8
    ? PRIORITIES[Math.min(PRIORITIES.indexOf(baseline), PRIORITIES.indexOf(jev.priority))] : baseline;
  const investigation = new Set(checks.filter((c) => c.status !== "pass").map((c) => c.runbook));
  if (jev.status === "ok" && jev.confidence >= 0.8 && (jev.runbook !== "observe" || !investigation.size)) investigation.add(jev.runbook);
  if (priority !== "P3") investigation.delete("observe");
  if (!investigation.size) investigation.add(priority === "P3" ? "observe" : "agent");
  return {
    schemaVersion: 1, generatedAt: new Date(start).toISOString(), durationMs: Math.max(0, now() - start),
    mode: "observe_and_recommend", priority,
    status: ["P0", "P1"].includes(priority) ? "incident" : priority === "P2" ? "degraded" : "healthy",
    checks, jev, recommendations: [...investigation].map((id) => ({ id, text: RUNBOOKS[id], requiresHumanApproval: id !== "observe" })),
    mutationsPerformed: 0,
    limitations: ["Pas d’audit des paiements, soldes, sauvegardes ou données clients.", "Pas de réparation, remboursement, migration ou déploiement automatique.", "Les sondes vérifient un échantillon du fonctionnement, pas toute la marketplace."],
  };
}

/**
 * ABSENCE D'ACTIVATION = ÉTAT RAPPORTÉ, JAMAIS SILENCE.
 *
 * La garde vivait dans le `if:` du job : sans la variable, GitHub rendait un
 * run `skipped` — indiscernable d'un vert dans l'onglet Actions. Mesuré le
 * 2026-09-21 : deux runs, deux `skipped`, zéro sonde tirée depuis #255, et
 * personne ne l'a vu. docs/JEV-SUPERVISION.md promettait pourtant « Aucun
 * succès silencieux » ; c'est la garde elle-même qui le défaisait.
 *
 * La garde vit désormais ICI : le job tourne toujours, et sans activation il
 * produit un rapport « inactive » et sort en échec. L'opt-in du porteur est
 * intact — aucune sonde n'est tirée, aucun appel facturable n'est émis.
 */
export function rapportInactif(now = Date.now) {
  return {
    schemaVersion: 1, generatedAt: new Date(now()).toISOString(), durationMs: 0,
    mode: "observe_and_recommend", priority: "P2", status: "inactive",
    checks: [{ id: "activation", status: "fail", httpStatus: null, attempts: 0, durationMs: 0, runbook: "agent" }],
    jev: { status: "not_configured" },
    recommendations: [{ id: "agent", text: RUNBOOKS.agent, requiresHumanApproval: true }],
    mutationsPerformed: 0,
    limitations: [
      "AUCUNE SONDE N’A ÉTÉ TIRÉE : ce rapport ne dit RIEN sur la santé de Zabelie.",
      "Poser la variable JEV_SUPERVISION_ENABLED=true et le secret TYPESAFE_API_KEY dans GitHub → Settings → Secrets and variables → Actions.",
      "Une variable Vercel ou un fichier local ne configure pas GitHub Actions.",
    ],
  };
}

export function renderReport(report) {
  const rows = report.checks.map((c) => `| ${c.id} | ${c.status} | ${c.httpStatus ?? "—"} |`).join("\n");
  const banniere = report.status === "inactive"
    ? "\n> ⛔ **SUPERVISION INACTIVE — aucune sonde n’a été tirée.**\n> Un run vert ou sauté n’atteste rien. Voir les limites ci-dessous.\n"
    : "";
  return `# Zabelie — supervision Jev\n${banniere}\nExécution : ${report.generatedAt}\n\nÉtat : **${report.status}** · Priorité : **${report.priority}** · Jev : **${report.jev.status}**\n\n| Contrôle | Résultat | HTTP |\n|---|---|---|\n${rows}\n\n## Maintenance proposée (non exécutée)\n\n${report.recommendations.map((r) => `- ${r.text}`).join("\n")}\n\n## Limites\n\n${report.limitations.map((l) => `- ${l}`).join("\n")}\n\nAucune modification de production. Une alerte n’est pas une preuve de cause racine.\n`;
}

async function main() {
  const outputArg = process.argv.indexOf("--output-dir");
  const output = resolve(outputArg >= 0 && process.argv[outputArg + 1] ? process.argv[outputArg + 1] : "agent-reports");
  // Sans activation : aucune sonde, aucun appel facturable — mais un rapport
  // écrit et un code de sortie non nul. Le silence est le seul état interdit.
  const report = (process.env.JEV_SUPERVISION_ENABLED ?? "").trim() === "true"
    ? await supervise({ key: process.env.TYPESAFE_API_KEY ?? "", githubToken: process.env.GITHUB_TOKEN ?? "" })
    : rapportInactif();
  await mkdir(output, { recursive: true, mode: 0o700 });
  await writeFile(join(output, "report.json"), JSON.stringify(report, null, 2) + "\n", { mode: 0o600 });
  await writeFile(join(output, "report.md"), renderReport(report), { mode: 0o600 });
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, renderReport(report));
  // Only a small, machine-owned summary is public. No upstream body or exception logged.
  console.log(JSON.stringify({ status: report.status, priority: report.priority, jev: report.jev.status, mutations: 0 }));
  process.exitCode = report.status === "healthy" ? 0 : report.status === "incident" ? 1 : 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(() => { console.error("supervision_failed_no_success_report"); process.exitCode = 1; });
}
