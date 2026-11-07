/**
 * ICÔNE — une seule famille, un seul trait, trois tailles (brief Phase 2.6).
 *
 * Avant : 38 SVG en ligne dans 28 fichiers, trois jeux distincts
 * (`trust-bar`, `department-icons`, `studio-icones`) et sept épaisseurs de
 * trait, de 1,5 à 2,5, sans compter que le trait se réduisait avec l'icône :
 * un `strokeWidth="2"` sur une grille de 24 rendait 1,33 px à 16 px de large.
 *
 * Ici, le trait est fixé en PIXELS D'ÉCRAN (`vector-effect: non-scaling-stroke`,
 * `.icone` dans `app/globals.css`) : 1,75 px à 16, 20 et 24 px, quelle que soit
 * la grille du dessin. La couleur suit le texte (`currentColor`).
 *
 * Décorative par défaut (`aria-hidden`) : une icône accompagne un libellé qui
 * se suffit. Une icône SEULE dans un bouton se nomme sur le bouton
 * (`aria-label`), pas ici. Composant sans état ni effet : serveur ou client.
 * `tests/icones.test.ts` garde.
 */
export type TailleIcone = 16 | 20 | 24;

export function Icone({
  taille = 20,
  viewBox = "0 0 24 24",
  className = "",
  children,
}: {
  taille?: TailleIcone;
  viewBox?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <svg
      viewBox={viewBox}
      width={taille}
      height={taille}
      aria-hidden="true"
      focusable="false"
      className={className ? `icone ${className}` : "icone"}
    >
      {children}
    </svg>
  );
}
