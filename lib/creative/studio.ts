import { z } from "zod";
import { PROPOSITION } from "./rule";

/**
 * Studio Créatif, Phase 3 — logique PURE des routes (docs/62 §6).
 * Aucun réseau, aucune base, aucun environnement : tout est passé en entrée.
 */

export const GENERATIONS_TABLE = "zabelie_creative_generations";
export const EVENTS_TABLE = "zabelie_creative_events";

/** Le drapeau doit valoir exactement `"true"` : toute autre valeur éteint. */
export function studioEnabled(env: { ZABELIE_STUDIO_ENABLED?: string }): boolean {
  return env.ZABELIE_STUDIO_ENABLED === "true";
}

/** 3 cadrages × 3 formats (rule.ts, PROPOSITION). */
export const NOMBRE_BRIEFS = PROPOSITION.cadrages.length * PROPOSITION.formats.length;

export const demandeSchema = z.object({
  productId: z.string().uuid(),
  /** Fournie par le client : un double clic ou un réseau qui rejoue ne paie pas deux fois. */
  idempotencyKey: z.string().uuid(),
  briefIndex: z.number().int().min(0).max(NOMBRE_BRIEFS - 1),
  /** Validés par `parametresSchema` dans le Prompt Builder. */
  params: z.unknown().optional(),
}).strict();

export type EtatLu =
  | { state: "requested" }
  | { state: "generating"; providerRef: string; depuis: string }
  | { state: "completed"; imageUrl: string }
  | { state: "failed"; error: string };

type Evenement = { etat: string; provider_ref?: string | null; image_url?: string | null; detail?: string | null; created_at: string };

/** L'état courant se lit dans les événements ; un état final l'emporte toujours. */
export function etatCourant(events: readonly Evenement[]): EtatLu {
  const fin = events.find((e) => e.etat === "completed" || e.etat === "failed");
  if (fin?.etat === "completed" && fin.image_url) return { state: "completed", imageUrl: fin.image_url };
  if (fin?.etat === "failed") return { state: "failed", error: fin.detail ?? "echec" };
  const g = events.find((e) => e.etat === "generating");
  if (g?.provider_ref) return { state: "generating", providerRef: g.provider_ref, depuis: g.created_at };
  return { state: "requested" };
}

/** Une ligne sans événement au-delà de ce délai : la soumission s'est perdue (crash, coupure). */
export const SOUMISSION_PERDUE_MS = 5 * 60_000;
/** Au-delà, la génération est déclarée échouée ; Higgsfield peut encore la finir, elle ne sera pas relancée. */
export const DELAI_GENERATION_MS = 15 * 60_000;

export type Action = "rendre" | "sonder" | { echouer: "soumission_perdue" | "delai_depasse" };

export function actionLecture(etat: EtatLu, creeLe: string, maintenant: number): Action {
  switch (etat.state) {
    case "completed":
    case "failed":
      return "rendre";
    case "requested":
      return maintenant - Date.parse(creeLe) > SOUMISSION_PERDUE_MS ? { echouer: "soumission_perdue" } : "rendre";
    case "generating":
      return maintenant - Date.parse(etat.depuis) > DELAI_GENERATION_MS ? { echouer: "delai_depasse" } : "sonder";
  }
}

/** Ce que le client voit : jamais la référence fournisseur ni l'horodatage interne. */
export function etatVisible(e: EtatLu): { state: EtatLu["state"]; imageUrl?: string; detail?: string } {
  switch (e.state) {
    case "completed": return { state: e.state, imageUrl: e.imageUrl };
    // `detail` est un CODE (delai_depasse, http_422…) : `error` reste réservé
    // aux messages traduits des réponses d'erreur.
    case "failed": return { state: e.state, detail: e.error };
    default: return { state: e.state };
  }
}

export type RefusInsertion = "doublon" | "quota_vendeur" | "quota_global" | "indisponible";

/**
 * Traduit l'erreur d'insertion (0118). La clé d'idempotence rejouée est
 * `23505` ; les quotas sont levés par le déclencheur avec un message exact.
 * Tout le reste est « indisponible », jamais un succès.
 */
export function refusInsertion(error: { code?: string; message?: string } | null): RefusInsertion {
  if (error?.code === "23505") return "doublon";
  if (error?.message === "studio_quota_vendeur") return "quota_vendeur";
  if (error?.message === "studio_quota_global") return "quota_global";
  return "indisponible";
}
