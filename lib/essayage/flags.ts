/**
 * Essayage virtuel — interrupteurs (docs/74 §3).
 *
 * Éteint par défaut. Seule la valeur exacte `true` ouvre : `"1"`, `"TRUE"`
 * ou `"true "` laissent fermé, comme pour le Studio (lib/digital-authoring/
 * flags.ts).
 *
 * `ZABELIE_ESSAYAGE_FOURNISSEUR` choisit qui habille la personne
 * (lib/essayage/fournisseur.ts). Absent, il n'y a aucun fournisseur : jamais
 * un défaut implicite qui dépenserait.
 */

export type EnvEssayage = {
  ZABELIE_ESSAYAGE_ENABLED?: string;
  ZABELIE_ESSAYAGE_FOURNISSEUR?: string;
  GENLOOK_API_KEY?: string;
  FASHN_API_KEY?: string;
  VERCEL_ENV?: string;
};

/** Lectures EXPLICITES (inventaire `.env.example`, `tests/env-example-complet.test.ts`). */
export function lireEnvEssayage(): EnvEssayage {
  return {
    ZABELIE_ESSAYAGE_ENABLED: process.env.ZABELIE_ESSAYAGE_ENABLED,
    ZABELIE_ESSAYAGE_FOURNISSEUR: process.env.ZABELIE_ESSAYAGE_FOURNISSEUR,
    GENLOOK_API_KEY: process.env.GENLOOK_API_KEY,
    FASHN_API_KEY: process.env.FASHN_API_KEY,
    VERCEL_ENV: process.env.VERCEL_ENV,
  };
}

export function essayageActif(env: EnvEssayage): boolean {
  return env.ZABELIE_ESSAYAGE_ENABLED === "true";
}
