import { ErreurFournisseur, type ImageResultat } from "./types";

/**
 * Essayage virtuel — ce que les adaptateurs réels partagent : un appel au
 * délai borné, la lecture prudente d'une réponse, et la récupération d'une
 * image en base64.
 *
 * Module SERVEUR : `Buffer` et des clés y passent. Jamais importé par un
 * composant client.
 */

/**
 * Un résultat plus lourd que ça n'est pas une image d'essayage : on le refuse
 * plutôt que de le transporter. 3 Mo, soit 4 Mo une fois en base64 : sous la
 * limite de 4,5 Mo d'une RÉPONSE de fonction Vercel.
 */
export const POIDS_MAX_RESULTAT = 3 * 1024 * 1024;
const TYPES_RESULTAT = ["image/png", "image/jpeg", "image/webp"] as const;

/**
 * Un appel au fournisseur, jamais plus long que `delaiMs`. Une panne réseau
 * ou un délai dépassé deviennent une `ErreurFournisseur`, dont le message ne
 * cite ni l'adresse complète ni les en-têtes.
 */
export async function appeler(f: typeof fetch, url: string, init: RequestInit, delaiMs: number, signal?: AbortSignal): Promise<Response> {
  // Une minuterie ordinaire, pas `AbortSignal.timeout` : celle-ci ne retient pas la boucle
  // d'événements, et Node pouvait s'arrêter avec l'appel encore en attente (vu en CI, test X7).
  // Elle retient la boucle pendant l'appel, puis est relâchée : elle borne encore la lecture du corps.
  const minuterie = new AbortController();
  const id = setTimeout(() => minuterie.abort(new DOMException("délai dépassé", "TimeoutError")), delaiMs);
  const borne = signal ? AbortSignal.any([signal, minuterie.signal]) : minuterie.signal;
  try {
    const res = await f(url, { ...init, signal: borne });
    id.unref?.();
    return res;
  } catch {
    clearTimeout(id);
    if (borne.aborted) throw new ErreurFournisseur("delai", "délai dépassé", true);
    throw new ErreurFournisseur("fournisseur", "fournisseur injoignable", true);
  }
}

/** Le corps JSON d'une réponse, ou `null` s'il n'en est pas un. */
export async function lireJson(res: Response): Promise<Record<string, unknown> | null> {
  try {
    const corps: unknown = await res.json();
    return corps && typeof corps === "object" ? (corps as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * Va chercher l'image d'un résultat (URL temporaire du fournisseur) et la rend
 * en base64. AUCUN en-tête d'authentification : l'hôte de l'image n'est pas
 * le fournisseur, et la clé ne doit jamais lui parvenir.
 */
export async function imageEnBase64(f: typeof fetch, url: string, delaiMs: number, signal?: AbortSignal): Promise<ImageResultat> {
  // Jamais sans chiffrement : l'image pourrait être remplacée en chemin.
  if (!url.startsWith("https://")) throw new ErreurFournisseur("fournisseur", "adresse de résultat non chiffrée");
  const res = await appeler(f, url, { method: "GET" }, delaiMs, signal);
  const type = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!res.ok || !(TYPES_RESULTAT as readonly string[]).includes(type)) throw new ErreurFournisseur("fournisseur", "résultat illisible");
  const octets = new Uint8Array(await res.arrayBuffer());
  if (octets.length === 0 || octets.length > POIDS_MAX_RESULTAT) throw new ErreurFournisseur("fournisseur", "résultat de taille inattendue");
  return { type: type as ImageResultat["type"], base64: Buffer.from(octets).toString("base64") };
}
