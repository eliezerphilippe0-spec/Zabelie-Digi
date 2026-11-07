/**
 * Quelle entrée de la barre inférieure correspond à la page affichée
 * (`components/barre-navigation.tsx`, chantier design Phase 4.5, V-28 A19).
 *
 * L'accueil ne s'allume que sur `/` exactement : sinon il serait actif sur
 * toutes les pages. Les autres entrées couvrent leurs sous-pages, mais pas un
 * préfixe de mot (`/panier-x` n'est pas `/panier`). Fonction pure, testée par
 * `tests/parcours-phase4.test.ts`.
 */
export function entreeActive(chemin: string, href: string): boolean {
  if (href === "/") return chemin === "/";
  return chemin === href || chemin.startsWith(`${href}/`);
}
