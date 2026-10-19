import { essayageActif, type EnvEssayage } from "./flags";
import { simulation } from "./fournisseurs/simulation";
import type { FournisseurEssayage } from "./fournisseurs/types";

/**
 * Le fournisseur choisi par l'environnement, ou aucun (docs/74 §3 et §8).
 *
 * Jamais de défaut implicite qui dépenserait : sans l'interrupteur, sans
 * `ZABELIE_ESSAYAGE_FOURNISSEUR` à une valeur exacte, ou sans la clé du
 * fournisseur choisi, il n'y a pas de fournisseur et pas d'essai.
 *
 * ⚠️ La simulation est REFUSÉE sur un déploiement de production
 * (`VERCEL_ENV`, pas `NODE_ENV`, qui vaut aussi « production » en Preview,
 * même règle que `choisirMoteur` du Studio) : sa silhouette passerait pour
 * un vrai essai.
 */
export function lireFournisseur(env: EnvEssayage): FournisseurEssayage | null {
  if (!essayageActif(env)) return null;
  if (env.ZABELIE_ESSAYAGE_FOURNISSEUR === "simulation") return env.VERCEL_ENV === "production" ? null : simulation();
  // `genlook` et `fashn` : branchés par les tâches 2.1 et 2.2. D'ici là, aucun fournisseur.
  return null;
}
