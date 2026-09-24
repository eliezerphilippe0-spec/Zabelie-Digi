import { configFromEnv, decide, DEFAULT_MODEL } from "./client";
import { redactForJev } from "./redact";

/**
 * Triage Jev des messages de support — MODE OBSERVATION (docs/61 §8).
 *
 * Jev étiquette, il ne route pas. Chaque message reste dans la file humaine :
 * la valeur rendue est toujours `file_humaine`, quel que soit le résultat, et
 * aucun appelant ne la lit pour décider quoi que ce soit. Ce qui est écrit, c'est
 * ce que Jev AURAIT dit, pour que le porteur fixe un seuil sur des chiffres
 * réels — le seuil n'existe pas encore, et c'est voulu.
 *
 * Ce module est PUR : environnement et journal injectés. Il ne lit aucune
 * table, n'appelle aucune RPC, n'écrit que la ligne qu'il remet à `journal`.
 * Le câblage serveur est dans `triage-server.ts`.
 *
 * Échec sûr, par construction : clé absente, délai dépassé, réponse invalide,
 * journal indisponible → une ligne `echec` quand c'est possible, un
 * avertissement sans texte sinon, et rien d'autre. Le support ne voit rien.
 */
export const JOURNAL_TABLE = "zabelie_jev_decisions";

export type TriageEnv = {
  ZABELIE_JEV_TRIAGE_ENABLED?: string;
  TYPESAFE_API_KEY?: string;
  JEV_BASE_URL?: string;
  JEV_MODEL?: string;
  JEV_TIMEOUT_MS?: string;
};

export type TriageInput = { caseId: string; requestId: string; body: string };

/** La ligne du journal. Aucun champ ne porte de texte de message. */
export type JournalRow = {
  case_id: string;
  request_id: string;
  mode: "observation";
  outcome: "classe" | "echec";
  failure_reason: string | null;
  entansyon: string | null;
  confidence: number | null;
  eskalade_p: number | null;
  ijans_p: number | null;
  model_demande: string;
  model_rendu: string | null;
  latency_ms: number;
  attempts: number;
  masquages: Record<string, number>;
};

export type TriageDeps = {
  journal: (row: JournalRow) => Promise<boolean>;
  fetcher?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
};

export type TriageOutcome =
  | { route: "file_humaine"; triage: "desactive" }
  | { route: "file_humaine"; triage: "observe"; journalise: boolean };

/** Défaut FERMÉ : seule la chaîne exacte `true` active le triage. */
export function jevTriageEnabled(env: TriageEnv): boolean {
  return env.ZABELIE_JEV_TRIAGE_ENABLED === "true";
}

export async function triageSupportMessage(input: TriageInput, env: TriageEnv, deps: TriageDeps): Promise<TriageOutcome> {
  if (!jevTriageEnabled(env)) return { route: "file_humaine", triage: "desactive" };

  const base = {
    case_id: input.caseId,
    request_id: input.requestId,
    mode: "observation" as const,
    model_demande: env.JEV_MODEL?.trim() || DEFAULT_MODEL,
  };
  const echec = (reason: string, latency = 0, attempts = 0, masquages: Record<string, number> = {}): JournalRow => ({
    ...base, outcome: "echec", failure_reason: reason, entansyon: null, confidence: null, eskalade_p: null, ijans_p: null,
    model_rendu: null, latency_ms: Math.round(latency), attempts, masquages,
  });

  let row: JournalRow;
  try {
    const config = configFromEnv(env);
    const redacted = redactForJev(input.body);
    const masquages = { ...redacted.counts };
    const result = await decide(redacted, config, { fetcher: deps.fetcher, sleep: deps.sleep, now: deps.now });
    row = result.ok
      ? {
          ...base, model_demande: config.model, outcome: "classe", failure_reason: null,
          entansyon: result.entansyon, confidence: result.confidence, eskalade_p: result.eskaladeP, ijans_p: result.ijansP,
          model_rendu: result.model, latency_ms: Math.round(result.latencyMs), attempts: result.attempts, masquages,
        }
      : echec(result.reason, result.latencyMs, result.attempts, masquages);
  } catch {
    // Configuration invalide ou état refusé : nommé, jamais détaillé.
    row = echec("config");
  }

  let journalise = false;
  try { journalise = await deps.journal(row); } catch { journalise = false; }
  return { route: "file_humaine", triage: "observe", journalise };
}
