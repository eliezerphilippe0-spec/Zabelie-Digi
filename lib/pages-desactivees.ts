import { creationActive } from "@/lib/digital-authoring/flags";
import { studioEnabled } from "@/lib/creative/studio";

/**
 * PAGES DERRIÈRE UN INTERRUPTEUR ÉTEINT — un VRAI 404, décidé par le proxy.
 *
 * `app/loading.tsx` fait streamer toutes les pages : un `notFound()` appelé
 * par la page arrive après l'envoi de l'en-tête et répond 200 avec « Cette page
 * n'existe pas » (soft 404 mesuré le 2026-10-29, docs/78). Les pages gardent
 * leur `notFound()` ; le proxy le rend vrai AVANT tout rendu, avec les mêmes
 * interrupteurs (jamais une copie de leur règle).
 */
export function pageDesactivee(
  chemin: string,
  env: { ZABELIE_AUTHORING_ENABLED?: string; ZABELIE_STUDIO_ENABLED?: string },
): boolean {
  if (/^\/tableau-de-bord\/creation(\/|$)/.test(chemin)) return !creationActive(env);
  if (/^\/tableau-de-bord\/studio\/?$/.test(chemin)) return !studioEnabled(env);
  return false;
}
