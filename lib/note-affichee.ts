/**
 * SEUIL D'AFFICHAGE DES NOTES — `docs/26` §14, audit `docs/69` (lot 1).
 *
 * Le cahier des charges l'écrit depuis la v3 : « Aucune note affichée sous un
 * seuil minimal d'avis : `★ 5 (1)` est un faux-précis. Le seuil est un
 * paramètre d'affichage, pas une opinion. » Le code affichait pourtant la
 * moyenne dès le premier avis — mesuré le 2026-10-14, `lib/products.ts`
 * rendait `ratingAvg` pour tout `rating_count > 0`.
 *
 * Pourquoi un seuil, sur une marketplace qui démarre : une moyenne sur un ou
 * deux avis n'informe pas, elle impressionne. Un seul avis à 5 ★ (souvent
 * l'ami du vendeur) placerait une boutique neuve au-dessus d'une boutique à
 * 4,8 sur quarante ventes. Les avis eux-mêmes restent lisibles sur la fiche :
 * seule la MOYENNE attend d'avoir un sens.
 *
 * ─── LA VALEUR : 3 ─────────────────────────────────────────────────────────
 * Choisie par l'agent (« sans préférence » = option recommandée), amendable
 * par le porteur d'un trait. Trois est le plus petit nombre où un avis isolé
 * ne fait plus la moyenne à lui seul ; au-delà, une boutique neuve attendrait
 * trop longtemps sa première note. Ce n'est PAS un paramètre commercial
 * (CLAUDE.md, règle 3) : il ne change aucun montant, il décide d'un affichage.
 *
 * ⚠️ PORTÉE. Tout l'affichage passe par `ProductView.ratingAvg`
 * (`lib/products.ts`) : cartes, fiche, accueil, assistant d'achat, données
 * structurées (`lib/jsonld-produit.ts`, qui n'émet `aggregateRating` que si la
 * moyenne existe). L'API publique v1 (`lib/api/v1/handlers.ts`) garde son
 * contrat : elle rend des DONNÉES, avec le nombre d'avis, et son consommateur
 * décide de l'afficher.
 */

export const SEUIL_NOTE_AFFICHEE = 3;

/** Moyenne arrondie au dixième, ou `null` sous le seuil (et sur toute entrée absurde). */
export function noteAffichee(somme: number, nombre: number): number | null {
  if (!Number.isInteger(nombre) || nombre < SEUIL_NOTE_AFFICHEE) return null;
  if (!Number.isFinite(somme) || somme < 0) return null;
  return Math.round((somme / nombre) * 10) / 10;
}
