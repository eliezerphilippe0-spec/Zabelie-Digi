/**
 * Studio de création éditoriale — drapeaux (docs/70 §3, PRD lot 1).
 *
 * Deux interrupteurs, éteints par défaut, INDÉPENDANTS du Studio images
 * (`ZABELIE_STUDIO_ENABLED`) : allumer l'un n'allume jamais l'autre.
 *   - `ZABELIE_AUTHORING_ENABLED` : le parcours manuel existe.
 *   - `ZABELIE_AUTHORING_AI_ENABLED` : les suggestions sont proposées. Sans le
 *     premier, il ne compte pas.
 * Seule la valeur exacte `true` ouvre : `"1"`, `"TRUE"` ou `"true "` laissent
 * fermé, comme pour le Studio images.
 *
 * `ZABELIE_AUTHORING_AI_PROVIDER` choisit le moteur : `mock` (simulation),
 * `openai` ou `gemini` (réels, tâche 3.4 — avec la clé du fournisseur,
 * partagée avec les descriptions produit). Absent → aucun moteur, jamais un
 * défaut implicite qui dépenserait.
 */

export type EnvCreation = {
  ZABELIE_AUTHORING_ENABLED?: string;
  ZABELIE_AUTHORING_AI_ENABLED?: string;
  ZABELIE_AUTHORING_AI_PROVIDER?: string;
  VERCEL_ENV?: string;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
};

/** Lectures EXPLICITES (inventaire `.env.example`, `tests/env-example-complet.test.ts`). */
export function lireEnvCreation(): EnvCreation {
  return {
    ZABELIE_AUTHORING_ENABLED: process.env.ZABELIE_AUTHORING_ENABLED,
    ZABELIE_AUTHORING_AI_ENABLED: process.env.ZABELIE_AUTHORING_AI_ENABLED,
    ZABELIE_AUTHORING_AI_PROVIDER: process.env.ZABELIE_AUTHORING_AI_PROVIDER,
    VERCEL_ENV: process.env.VERCEL_ENV,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_MODEL: process.env.OPENAI_MODEL,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    GEMINI_MODEL: process.env.GEMINI_MODEL,
  };
}

export function creationActive(env: EnvCreation): boolean {
  return env.ZABELIE_AUTHORING_ENABLED === "true";
}

export function iaActive(env: EnvCreation): boolean {
  return creationActive(env) && env.ZABELIE_AUTHORING_AI_ENABLED === "true";
}

export type ChoixMoteur =
  | { ok: true; moteur: "mock" | "openai" | "gemini" }
  | { ok: false; code: "ia_coupee" | "configuration_absente" };

/**
 * Le moteur à utiliser, ou la raison de n'en utiliser aucun.
 *
 * ⚠️ La simulation est REFUSÉE sur un déploiement de production
 * (`VERCEL_ENV`, pas `NODE_ENV` qui vaut aussi « production » en Preview —
 * même règle que `garderProduction`, lib/moncash.ts) : son texte, une fois
 * dans un guide vendu, passerait pour une génération réelle (PRD §8.3).
 */
export function choisirMoteur(env: EnvCreation): ChoixMoteur {
  if (!iaActive(env)) return { ok: false, code: "ia_coupee" };
  if (env.ZABELIE_AUTHORING_AI_PROVIDER === "mock") {
    return env.VERCEL_ENV === "production" ? { ok: false, code: "configuration_absente" } : { ok: true, moteur: "mock" };
  }
  // Fournisseur réel : la valeur exacte ET sa clé. Une valeur inconnue, ou une
  // clé posée pour l'autre fournisseur, reste une configuration absente —
  // jamais une bascule silencieuse vers un défaut.
  if (env.ZABELIE_AUTHORING_AI_PROVIDER === "openai" && env.OPENAI_API_KEY?.trim()) return { ok: true, moteur: "openai" };
  if (env.ZABELIE_AUTHORING_AI_PROVIDER === "gemini" && env.GEMINI_API_KEY?.trim()) return { ok: true, moteur: "gemini" };
  return { ok: false, code: "configuration_absente" };
}
