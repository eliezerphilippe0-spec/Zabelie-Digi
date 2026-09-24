import { z } from "zod";
import { PROPOSITION, type Cadrage, type Format } from "./rule";

/**
 * Studio Créatif, Phase 3 — logique PURE des routes (docs/62 §6).
 * Aucun réseau, aucune base, aucun environnement : tout est passé en entrée.
 */

export const GENERATIONS_TABLE = "zabelie_creative_generations";
export const EVENTS_TABLE = "zabelie_creative_events";
export const CONFIG_TABLE = "zabelie_studio_config";

/** Le drapeau doit valoir exactement `"true"` : toute autre valeur éteint. */
export function studioEnabled(env: { ZABELIE_STUDIO_ENABLED?: string }): boolean {
  return env.ZABELIE_STUDIO_ENABLED === "true";
}

/** 3 cadrages × 3 formats (rule.ts, PROPOSITION). */
export const NOMBRE_BRIEFS = PROPOSITION.cadrages.length * PROPOSITION.formats.length;

/**
 * Position du brief (cadrage, format) dans la liste de `buildBriefs`, qui
 * boucle sur les cadrages PUIS sur les formats. L'écran choisit un cadrage et
 * un format ; la route reçoit l'index. Le test croise les deux ordres.
 */
export function indexBrief(cadrage: Cadrage, format: Format): number {
  const c = PROPOSITION.cadrages.indexOf(cadrage);
  const f = PROPOSITION.formats.indexOf(format);
  if (c < 0 || f < 0) throw new Error("brief_inconnu");
  return c * PROPOSITION.formats.length + f;
}

export const demandeSchema = z.object({
  productId: z.string().uuid(),
  /** Fournie par le client : un double clic ou un réseau qui rejoue ne paie pas deux fois. */
  idempotencyKey: z.string().uuid(),
  briefIndex: z.number().int().min(0).max(NOMBRE_BRIEFS - 1),
  /** Validés par `parametresSchema` dans le Prompt Builder. */
  params: z.unknown().optional(),
  /**
   * Prix (HTG) que le vendeur a vu et accepté pour une image au-delà du
   * gratuit (0119). La base le compare au prix du moment : un prix périmé est
   * refusé, jamais ajusté. Absent = aucun consentement.
   */
  prixConsentiHtg: z.number().int().min(0).max(1000).optional(),
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

export type RefusInsertion = "doublon" | "quota_vendeur" | "quota_global" | "paiement_requis" | "indisponible";

/**
 * Traduit l'erreur d'insertion (0118). La clé d'idempotence rejouée est
 * `23505` ; les quotas sont levés par le déclencheur avec un message exact.
 * Tout le reste est « indisponible », jamais un succès.
 */
export function refusInsertion(error: { code?: string; message?: string } | null): RefusInsertion {
  if (error?.code === "23505") return "doublon";
  if (error?.message === "studio_quota_vendeur") return "quota_vendeur";
  if (error?.message === "studio_quota_global") return "quota_global";
  if (error?.message === "studio_paiement_requis") return "paiement_requis";
  return "indisponible";
}

// ── Côté écran (Phase 4) : ce que le client envoie et comment il lit la réponse ──

/**
 * Le corps de POST /api/studio/generations. Aucun texte libre : un produit,
 * une clé, un INDEX de brief. Le prix n'y figure que s'il a été consenti.
 */
export function corpsDemande(productId: string, idempotencyKey: string, cadrage: Cadrage, format: Format, prixConsentiHtg?: number) {
  return {
    productId,
    idempotencyKey,
    briefIndex: indexBrief(cadrage, format),
    ...(prixConsentiHtg === undefined ? {} : { prixConsentiHtg }),
  };
}

export type LectureEcran =
  | { k: "payant"; prix: number }
  | { k: "pret"; url: string }
  | { k: "echec" }
  | { k: "suivre"; id: string }
  | { k: "erreur"; message: string | null };

/** Traduit une réponse de la route en ce que l'écran doit faire. Rien d'implicite. */
export function lireReponse(status: number, data: unknown): LectureEcran {
  const d = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  if (status === 402 && typeof d.prixHtg === "number" && Number.isInteger(d.prixHtg) && d.prixHtg >= 0) return { k: "payant", prix: d.prixHtg };
  if (d.state === "completed" && typeof d.imageUrl === "string" && d.imageUrl.startsWith("https://")) return { k: "pret", url: d.imageUrl };
  if (d.state === "failed") return { k: "echec" };
  if ((status === 202 || status === 200) && typeof d.id === "string") return { k: "suivre", id: d.id };
  return { k: "erreur", message: typeof d.error === "string" ? d.error : null };
}
