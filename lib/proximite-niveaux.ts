/**
 * Les niveaux de proximité entre un acheteur et un vendeur — types et ordre
 * SEULEMENT, sans aucun import.
 *
 * Ce module est volontairement à part de `lib/proximite.ts`. `lib/shopping-ai.ts`
 * en a besoin pour classer les offres, et le fournisseur IA importe
 * `lib/shopping-ai.ts` : le test de confinement
 * (`tests/shopping-ai.test.ts`, « le module qui parle au modèle n'atteint ni la
 * base ni l'argent ») interdit qu'aucun import de ce graphe ne touche à
 * Supabase. `lib/proximite.ts` lit les zones (donc la base) ; celui-ci non.
 */

/**
 * `katye`    — même quartier.
 * `komin`    — même commune.
 * `depatman` — même département.
 * `inconnue` — le vendeur n'a pas déclaré de zone : on NE SAIT PAS.
 * `ailleurs` — le vendeur a une zone, dans un autre département.
 *
 * `inconnue` n'est pas `ailleurs`, et la différence est le fond du sujet : dire
 * « loin » d'un vendeur dont on ignore la zone serait une affirmation sans
 * mesure. Au 2026-10-29, aucun profil n'en déclare une.
 */
export type NiveauProximite = "katye" | "komin" | "depatman" | "inconnue" | "ailleurs";

/**
 * Rang de tri : le plus petit passe en premier.
 *
 * `inconnue` (3) est AU MILIEU, et c'est voulu : au-dessus du connu-lointain
 * (on ne rétrograde pas un vendeur sur une absence de donnée), sous le
 * connu-proche. Les types sans proximité (fichier, service) reçoivent le même
 * rang que `inconnue` — sinon, tant que personne n'a déclaré de zone, tout
 * fichier numérique passerait devant tout objet physique sans raison.
 */
export const RANG_PROXIMITE: Record<NiveauProximite, number> = {
  katye: 0,
  komin: 1,
  depatman: 2,
  inconnue: 3,
  ailleurs: 4,
};

/** Proche = quartier, commune ou département : tout ce qui précède `inconnue`. */
export function estProche(niveau: NiveauProximite): boolean {
  return RANG_PROXIMITE[niveau] < RANG_PROXIMITE.inconnue;
}

/**
 * Ce que l'acheteur lit d'un vendeur : le niveau, et SI ce niveau vient des zones
 * où le vendeur DÉCLARE livrer (0158) plutôt que de l'endroit où il est installé.
 *
 * La distinction est affichée, pas décorative : « Vendeur dans votre commune »
 * est un fait de localisation ; « Le vendeur déclare livrer dans votre commune »
 * est une déclaration du vendeur, que Zabelie ne garantit pas (elle ne livre pas).
 */
export type ProximiteVendeur = { niveau: NiveauProximite; dessert: boolean };

/**
 * Fusionne la zone d'installation (`maison`) et le meilleur niveau de ses zones
 * desservies (`desserte`).
 *
 * - le plus PROCHE gagne ; `dessert` n'est vrai que si la desserte est
 *   STRICTEMENT plus proche (à égalité, le fait de localisation prime sur la
 *   déclaration) ;
 * - sans niveau proche : `ailleurs` si l'un des deux est connu et lointain,
 *   sinon `inconnue` — jamais « loin » pour un vendeur dont on ignore tout.
 *
 * ⚠️ Une zone d'installation proche reste affichée comme telle même si le
 * vendeur ne déclare livrer qu'ailleurs : « il est là » n'est pas « il livre
 * là », et l'écran ne dit que le premier.
 */
export function fusionnerNiveaux(maison: NiveauProximite, desserte: NiveauProximite): ProximiteVendeur {
  const maisonProche = estProche(maison);
  if (estProche(desserte) && (!maisonProche || RANG_PROXIMITE[desserte] < RANG_PROXIMITE[maison])) {
    return { niveau: desserte, dessert: true };
  }
  if (maisonProche) return { niveau: maison, dessert: false };
  return { niveau: maison === "ailleurs" || desserte === "ailleurs" ? "ailleurs" : "inconnue", dessert: false };
}
