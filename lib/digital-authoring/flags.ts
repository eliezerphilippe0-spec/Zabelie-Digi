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
 * `ZABELIE_AUTHORING_AI_PROVIDER` choisit le moteur : `mock` (simulation) ou,
 * à la tâche 3.4, un fournisseur réel. Absent → aucun moteur, jamais un
 * défaut implicite qui dépenserait.
 */

export type EnvCreation = {
  ZABELIE_AUTHORING_ENABLED?: string;
  ZABELIE_AUTHORING_AI_ENABLED?: string;
  ZABELIE_AUTHORING_AI_PROVIDER?: string;
  VERCEL_ENV?: string;
};

/** Lectures EXPLICITES (inventaire `.env.example`, `tests/env-example-complet.test.ts`). */
export function lireEnvCreation(): EnvCreation {
  return {
    ZABELIE_AUTHORING_ENABLED: process.env.ZABELIE_AUTHORING_ENABLED,
    ZABELIE_AUTHORING_AI_ENABLED: process.env.ZABELIE_AUTHORING_AI_ENABLED,
    ZABELIE_AUTHORING_AI_PROVIDER: process.env.ZABELIE_AUTHORING_AI_PROVIDER,
    VERCEL_ENV: process.env.VERCEL_ENV,
  };
}

export function creationActive(env: EnvCreation): boolean {
  return env.ZABELIE_AUTHORING_ENABLED === "true";
}

export function iaActive(env: EnvCreation): boolean {
  return creationActive(env) && env.ZABELIE_AUTHORING_AI_ENABLED === "true";
}

export type ChoixMoteur =
  | { ok: true; moteur: "mock" }
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
  // Fournisseur réel : tâche 3.4. D'ici là, toute autre valeur est une
  // configuration absente — jamais une bascule silencieuse vers un défaut.
  return { ok: false, code: "configuration_absente" };
}
