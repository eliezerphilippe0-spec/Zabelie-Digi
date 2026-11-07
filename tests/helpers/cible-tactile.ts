/**
 * « CETTE CHAÎNE DE CLASSES DÉCLARE UNE CIBLE D'AU MOINS 44 PX DE HAUT. »
 *
 * Avant la Phase 2 du chantier design, la seule déclaration était l'utilitaire
 * `min-h-11`, et une dizaine de gardes le cherchaient au texte. Depuis, un
 * bouton reçoit sa hauteur de sa CLASSE : `bouton` vaut 48 px, `bouton-compact`
 * 44, `bouton-grand` 56 — tenu par `tests/boutons-variantes.test.ts` (V1), qui
 * refuse toute règle de bouton sous 44 px. La base `bouton` est donc, à elle
 * seule, une déclaration de cible : c'est elle qu'on exige, pas la variante.
 *
 * ⚠️ À appliquer à une CHAÎNE DE CLASSES, jamais à un fichier entier : le mot
 * « bouton » vit aussi dans les commentaires français de ce dépôt, et un motif
 * lâché sur le source serait vert sur un commentaire.
 */
export const CIBLE_44 = /(?<![\w:-])(?:min-h-(?:11|12|14)|bouton|champ)(?![\w-])/;

export const cible44 = (classes: string | readonly string[]): boolean =>
  CIBLE_44.test(typeof classes === "string" ? classes : classes.join(" "));

/** Le source déclare-t-il au moins une cible dans un `className` (littéral ou gabarit) ? */
export const declareCible = (src: string): boolean =>
  [...src.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)].some((m) => cible44(m[1] ?? m[2]));
