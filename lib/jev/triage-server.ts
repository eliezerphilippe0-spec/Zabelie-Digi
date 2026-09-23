import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { JOURNAL_TABLE, jevTriageEnabled, triageSupportMessage, type TriageEnv, type TriageInput } from "@/lib/jev/triage";

/**
 * Câblage serveur du triage Jev en observation. Lectures d'environnement
 * EXPLICITES (inventaire `.env.example`) ; le seul accès base est l'insertion
 * dans le journal `zabelie_jev_decisions` (0117).
 */
function env(): TriageEnv {
  return {
    ZABELIE_JEV_TRIAGE_ENABLED: process.env.ZABELIE_JEV_TRIAGE_ENABLED,
    TYPESAFE_API_KEY: process.env.TYPESAFE_API_KEY,
    JEV_BASE_URL: process.env.JEV_BASE_URL,
    JEV_MODEL: process.env.JEV_MODEL,
    JEV_TIMEOUT_MS: process.env.JEV_TIMEOUT_MS,
  };
}

export function jevTriageActive(): boolean {
  return jevTriageEnabled(env());
}

/** Appelé APRÈS la réponse au client. Ne lève jamais, ne journalise aucun texte. */
export async function triageSupportInBackground(input: TriageInput): Promise<void> {
  try {
    const admin = createAdminClient();
    const outcome = await triageSupportMessage(input, env(), {
      journal: async (row) => {
        const { error } = await admin.from(JOURNAL_TABLE).insert(row);
        return !error;
      },
    });
    if (outcome.triage === "observe" && !outcome.journalise) {
      console.warn(`[jev-triage] journal non écrit (case ${input.caseId}) — message en file humaine, inchangé`);
    }
  } catch {
    console.warn(`[jev-triage] échec (case ${input.caseId}) — message en file humaine, inchangé`);
  }
}
