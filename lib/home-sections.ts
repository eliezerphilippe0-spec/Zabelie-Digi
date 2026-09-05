/**
 * RÈGLE DES SEUILS de l'accueil — accueil premium, Phase 3 (brief §4.3).
 *
 * Une seule règle, côté serveur, partagée par toutes les sections : une
 * rangée de produits ne s'affiche que si elle a de quoi remplir une ligne.
 * Sous le seuil, elle ne montre pas un titre au-dessus de deux cartes — elle
 * s'efface. Ce n'est pas une décoration : avec trois produits publiés (mesuré
 * le 2026-09-04), l'accueil montrait le MÊME produit dans quatre rangées, et
 * se lisait comme une boutique vide qui insiste.
 *
 * ⚠️ Le seuil desktop ne peut pas se décider au serveur (pas de viewport) :
 * il s'applique en CSS. Une rangée de 4 ou 5 produits est rendue et masquée
 * au-delà de `lg` (`lg:hidden`) — six colonnes à moitié pleines se lisent
 * comme un rayon en rupture.
 *
 * Éprouvé par `tests/home-premium-structure.test.ts` (connu-positif ET
 * connu-négatif, et les mutations qui déplacent chaque seuil).
 */

/** Une rangée mobile : deux colonnes, deux lignes pleines. */
export const SEUIL_RANGEE = 4;
/** Une rangée desktop : six colonnes, une ligne pleine. */
export const SEUIL_RANGEE_DESKTOP = 6;
/** « Meilleurs vendeurs » : trois vendeurs ayant chacun au moins une vente PAYÉE. */
export const SEUIL_VENDEURS = 3;

export function rangeeVisible(nombre: number): boolean {
  return nombre >= SEUIL_RANGEE;
}

/** Classes à poser sur la section : masquée au-delà de `lg` sous six items. */
export function classesRangee(nombre: number): string {
  return nombre >= SEUIL_RANGEE_DESKTOP ? "" : "lg:hidden";
}

export type VendeurCompte = { ventesPayees: number };

/**
 * Les vendeurs affichables : ceux qui ont au moins UNE vente payée — pas un
 * `sales_count`, qui est un compteur applicatif, mais une commande `paid`.
 * La section ne s'affiche que s'il en reste au moins SEUIL_VENDEURS.
 */
export function vendeursAffichables<T extends VendeurCompte>(vendeurs: T[]): T[] {
  const avecVente = vendeurs.filter((v) => v.ventesPayees > 0);
  return avecVente.length >= SEUIL_VENDEURS ? avecVente : [];
}

/**
 * Titre d'une carte : jamais une URL brute, jamais une chaîne vide. Un titre
 * absent tombe sur le libellé neutre (« Produit »), et le manque est
 * JOURNALISÉ — en production aussi : c'est un défaut de données à corriger,
 * et le journal Vercel est le seul endroit où il se lit (règle du dépôt :
 * l'absence de signal doit être un signal). Les cartes de la Phase 4 passent
 * par ici.
 */
export function titreCarte(
  titre: string | null | undefined,
  repli: string,
  journal: (m: string) => void = (m) => console.warn(m),
  identifiant = "?"
): string {
  const propre = (titre ?? "").trim();
  if (propre === "" || /^\/(produit|catalogue)\b/.test(propre) || /^https?:\/\//.test(propre)) {
    journal(`[accueil] carte ${identifiant} sans titre exploitable (« ${propre} ») — repli « ${repli} »`);
    return repli;
  }
  return propre;
}
