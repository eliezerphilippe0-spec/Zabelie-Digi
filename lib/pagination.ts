/**
 * PAGINATION — les trois calculs, une seule fois.
 *
 * Trois surfaces paginent déjà, chacune avec sa propre arithmétique : le
 * catalogue, les files d'action admin, et maintenant les ventes du vendeur.
 * Recopier « borne basse, borne haute, nombre de pages » à trois endroits,
 * c'est se garantir que la correction d'un décalage n'atterrira que sur deux.
 *
 * ⚠️ LE PIÈGE EST DÉJÀ TOMBÉ UNE FOIS, et il est encodé ici :
 * `Math.max(1, NaN)` vaut **NaN**, pas 1. Une borne « gardée » de cette
 * façon laisse passer un `range(NaN, NaN)` — qui ne rend pas « rien », mais
 * une fenêtre que personne n'a demandée. Un écran plausible et faux.
 * `Number.isFinite` d'abord, toujours.
 */

/** Normalise un numéro de page venant d'une URL. Jamais confiance à la forme. */
export function pageValide(brut: string | number | undefined | null): number {
  const n = typeof brut === "number" ? brut : Number.parseInt(String(brut ?? "1"), 10);
  return Number.isFinite(n) && n > 1 ? Math.floor(n) : 1;
}

/** Bornes `range()` PostgREST — inclusives des deux côtés, comme lui. */
export function bornes(page: number, taille: number): [number, number] {
  const p = pageValide(page);
  const de = (p - 1) * taille;
  return [de, de + taille - 1];
}

/** Nombre de pages. Au moins 1 : une liste vide reste « page 1 sur 1 ». */
export function nbPages(total: number, taille: number): number {
  if (!Number.isFinite(total) || total <= 0) return 1;
  return Math.ceil(total / taille);
}

/**
 * Ramène une page dans les bornes réelles.
 *
 * Sans ça, `?ventes=99` sur deux pages afficherait « page 99 sur 2 » — un
 * repère qui dit au visiteur qu'il s'est perdu sans lui dire où il est.
 */
export function pageDansBornes(page: number, total: number, taille: number): number {
  return Math.min(pageValide(page), nbPages(total, taille));
}
