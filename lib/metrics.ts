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
