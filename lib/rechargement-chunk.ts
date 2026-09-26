/**
 * ÉCHEC DE CHARGEMENT D'UN FICHIER DE L'APPLICATION — le seul remède est un
 * rechargement complet.
 *
 * Mesuré le 2026-09-26 en parcourant zabelie.com pendant un déploiement : une
 * page ouverte AVANT le déploiement a demandé `main-app-1d773e80….js`, qui
 * n'existait plus après (404), et la frontière d'erreur a pris le relais
 * (`ChunkLoadError`). Même effet sur une connexion 3G qui coupe au mauvais
 * moment. Le bouton « Réessayer » appelait `reset()`, qui re-rend la page avec
 * les MÊMES fichiers : l'échec se répète, le visiteur reste bloqué. Seul un
 * rechargement va chercher la page — et ses fichiers — à jour.
 */

const CLE = "zabelie:rechargement-chunk";
/** Au plus un rechargement automatique par fenêtre : jamais de boucle. */
export const DELAI_MS = 30_000;

/** L'erreur vient-elle d'un fichier JS/CSS de l'application qui n'a pas pu être chargé ? */
export function estEchecDeChargement(erreur: unknown): boolean {
  if (!erreur || typeof erreur !== "object") return false;
  const { name, message } = erreur as { name?: unknown; message?: unknown };
  if (name === "ChunkLoadError") return true;
  return typeof message === "string" && /Loading (CSS )?chunk [\w./-]+ failed/i.test(message);
}

/**
 * Recharge la page si aucun rechargement automatique n'a eu lieu depuis
 * `DELAI_MS`. Rend `true` si le rechargement est lancé. Stockage absent ou
 * bloqué (navigation privée) : AUCUN rechargement automatique — sans mémoire,
 * la garde contre la boucle n'existe pas ; le bouton reste là.
 */
export function rechargerUneFois(
  stockage: Pick<Storage, "getItem" | "setItem"> | null,
  maintenant: number,
  recharger: () => void
): boolean {
  if (!stockage) return false;
  try {
    const dernier = Number(stockage.getItem(CLE) ?? 0);
    if (Number.isFinite(dernier) && maintenant - dernier < DELAI_MS) return false;
    stockage.setItem(CLE, String(maintenant));
  } catch {
    return false;
  }
  recharger();
  return true;
}

/** Le stockage de session du navigateur, ou `null` s'il est bloqué. */
export function stockageSession(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}
