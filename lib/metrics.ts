import { headers } from "next/headers";

/**
 * Mesure de la landing — cinq événements, zéro PII, zéro stockage nouveau.
 *
 * DESTINATION : le journal de la route (une ligne JSON préfixée
 * `[metrics:landing]`), c'est-à-dire les logs Vercel — le même endroit que la
 * preuve d'exécution des crons. Pas de table : une migration pour compter des
 * clics avant la première commande réelle serait un poids mort, et le journal
 * suffit à arbitrer le ratio acheteur/vendeur avec des données réelles.
 * Le jour où il faut de l'historique long, une table remplace CE fichier sans
 * toucher aux appelants.
 *
 * CE QU'ON NE JOURNALISE PAS : le contenu des recherches (le capteur de
 * demande le fait déjà, avec sa discipline de fingerprint salé — doublonner
 * ici créerait un second journal de contenu SANS cette discipline), aucune
 * IP, aucun identifiant. Uniquement l'événement et, pour les catégories, le
 * slug public du rayon.
 */
export type LandingEvent =
  | "search_submitted"
  | "category_clicked"
  | "whatsapp_clicked"
  | "sell_cta_clicked"
  | "demand_sensor_submitted";

export const LANDING_EVENTS: ReadonlySet<string> = new Set([
  "search_submitted",
  "category_clicked",
  "whatsapp_clicked",
  "sell_cta_clicked",
  "demand_sensor_submitted",
] satisfies LandingEvent[]);

/**
 * Un rendu déclenché par le PRÉCHARGEMENT d'un lien n'est pas une visite :
 * sans ce garde, chaque survol de lien compterait comme un clic et les
 * chiffres seraient inutilisables le jour où on les lit.
 */
export async function isPrefetch(): Promise<boolean> {
  const h = await headers();
  return h.get("next-router-prefetch") !== null || h.get("purpose") === "prefetch";
}

export function logLanding(event: LandingEvent, data?: Record<string, string>) {
  // Une ligne, parsable, datée par la plateforme de logs — pas par nous
  // (Date.now est interdit de toute façon dans les workflows du dépôt, et le
  // journal Vercel horodate déjà chaque ligne).
  console.log(`[metrics:landing] ${JSON.stringify({ event, ...data })}`);
}

/**
 * TUNNEL VENDEUR — création d'une fiche, puis upload couverture et galerie,
 * chacun en OK et en KO (audit REA 2026-10-26, #3).
 *
 * Pourquoi il manquait : le chemin acheteur était instrumenté, le chemin
 * vendeur non (`CLAUDE.md`, `lib/storage-buckets.ts`). `sell_cta_clicked`
 * mesurait le CLIC sur « vendre » ; rien après. Un vendeur qui échoue à
 * l'upload ne laissait aucune trace, et « personne n'essaie » et « tout le
 * monde échoue » rendaient le même silence.
 *
 * On journalise DONC les deux issues de chaque étape — l'absence de signal est
 * un signal (corollaire d'observabilité de `CLAUDE.md`) : un `ok:false` en
 * rafale dit « bucket ou clé cassés », un vide total dit « personne n'arrive
 * jusqu'ici ».
 *
 * ZÉRO PII, comme la mesure de la landing : ni `user_id`, ni `product_id`, ni
 * nom de fichier. Le `reason` est un bucket technique (code de statut HTTP,
 * libellé d'étape), jamais une donnée personnelle. `kind` est le TYPE de
 * produit (physical/file/service), pas une identité.
 */
export type SellerFunnelEvent = "product_created" | "cover_upload" | "gallery_upload";

export const SELLER_FUNNEL_EVENTS: ReadonlySet<string> = new Set([
  "product_created",
  "cover_upload",
  "gallery_upload",
] satisfies SellerFunnelEvent[]);

export function logSellerFunnel(
  event: SellerFunnelEvent,
  data: { ok: boolean; reason?: string; kind?: string }
) {
  const charge: Record<string, string | boolean> = { event, ok: data.ok };
  if (data.reason) charge.reason = data.reason;
  if (data.kind) charge.kind = data.kind;
  console.log(`[metrics:seller] ${JSON.stringify(charge)}`);
}
