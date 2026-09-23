/**
 * Harnais d'évaluation Jev — Phase 1 (docs/61). LOCAL, hors production.
 *
 *   JEV_EVAL_CSV=jev-eval-data/messages.csv \
 *     node --env-file=.env.local --import tsx scripts/jev-eval/run.ts [--dry-run]
 *
 * `--dry-run` : lit, valide et redacte le jeu, affiche le corps d'UNE requête,
 * n'appelle pas Jev et n'exige aucune clé. À lancer avant le vrai passage.
 *
 * Variables : TYPESAFE_API_KEY (obligatoire hors dry-run), JEV_BASE_URL (URL
 * complète de l'endpoint, défaut TypeSafe direct), JEV_MODEL, JEV_TIMEOUT_MS,
 * JEV_EVAL_MAX (plafond d'appels facturables, défaut 250).
 *
 * Aucune base, aucune route, aucune table : le test de confinement
 * (`tests/jev-eval.test.ts`) refuse tout import autre que node:, zod et ce
 * dossier.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseLabeledCsv } from "./csv";
import { buildBody, configFromEnv, decide } from "./jev-client";
import { summarize, type EvalRecord } from "./metrics";
import { redactForJev } from "./redact";
import { renderReport } from "./report";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Le jeu réel ne doit jamais pouvoir être commité : dans le dépôt, il doit être ignoré. */
export function assertDatasetNotTracked(path: string, root = ROOT): void {
  const rel = relative(root, resolve(path));
  if (rel.startsWith("..") || isAbsolute(rel)) return; // hors dépôt : rien à commiter
  const check = spawnSync("git", ["check-ignore", "-q", "--no-index", rel], { cwd: root });
  if (check.status !== 0) throw new Error(`jeu_non_ignore : ${rel} serait commitable — le placer dans jev-eval-data/`);
}

export function maxCalls(env: Record<string, string | undefined>): number {
  const max = Number(env.JEV_EVAL_MAX ?? 250);
  if (!Number.isInteger(max) || max < 1 || max > 1000) throw new Error("config_max_invalide : 1..1000");
  return max;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const csvPath = process.env.JEV_EVAL_CSV?.trim();
  if (!csvPath) throw new Error("config_csv_absent : JEV_EVAL_CSV");
  assertDatasetNotTracked(csvPath);
  const items = parseLabeledCsv(readFileSync(csvPath, "utf8"));
  const max = maxCalls(process.env);
  if (items.length > max) throw new Error(`jeu_trop_grand : ${items.length} messages > JEV_EVAL_MAX=${max}`);
  const redacted = items.map((item) => ({ item, r: redactForJev(item.message) }));
  const totals = redacted.reduce<Record<string, number>>((acc, { r }) => {
    for (const [k, v] of Object.entries(r.counts)) acc[k] = (acc[k] ?? 0) + v;
    return acc;
  }, {});
  console.error(`[jev-eval] ${items.length} messages lus · masquages : ${JSON.stringify(totals)}`);

  if (dryRun) {
    console.error("[jev-eval] --dry-run : aucun appel. Corps de la première requête :");
    console.log(JSON.stringify(buildBody(redacted[0].r, process.env.JEV_MODEL?.trim() || "jev-latest"), null, 2));
    return;
  }

  const config = configFromEnv(process.env);
  const records: EvalRecord[] = [];
  for (const [i, { item, r }] of redacted.entries()) {
    const result = await decide(r, config);
    records.push({ item, redacted: r.text, result });
    // Progression SANS texte de message.
    console.error(`[jev-eval] ${i + 1}/${items.length} ${result.ok ? "ok" : `échec ${result.reason}`} ${Math.round(result.latencyMs)} ms`);
  }

  const summary = summarize(records);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = join(ROOT, "agent-reports", "jev-eval");
  mkdirSync(dir, { recursive: true });
  const md = join(dir, `rapport-${stamp}.md`);
  writeFileSync(md, renderReport(summary, {
    date: new Date().toISOString().slice(0, 10),
    endpoint: config.endpoint,
    model: config.model,
    dataset: relative(ROOT, resolve(csvPath)),
  }));
  writeFileSync(join(dir, `resultats-${stamp}.json`), JSON.stringify(records, null, 2));
  console.error(`[jev-eval] rapport : ${relative(ROOT, md)}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error: unknown) => {
    // Jamais la clé, jamais un corps fournisseur : le client ne les remonte pas.
    console.error(`[jev-eval] arrêt : ${error instanceof Error ? error.message : "erreur"}`);
    process.exit(1);
  });
}
