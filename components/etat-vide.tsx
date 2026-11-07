/**
 * ÉTAT VIDE — un dessin, ce qui se passe, ce qu'on peut faire (brief Phase 2.5).
 *
 * Avant : chaque écran vide écrivait le sien, en six mises en forme (bordure
 * pleine ou pointillée, fond ou pas, titre en `p` ou en `h2`), et seul le
 * catalogue avait un dessin. Un écran vide muet se lit comme une panne : la
 * règle des états zéro du dépôt veut qu'il dise quoi faire. Le texte et
 * l'action restent ceux de chaque écran, traduits par `t()` côté appelant :
 * ce composant n'écrit aucune chaîne.
 *
 * Le dessin est l'étal vide qui ouvrait le catalogue, repris ici plutôt que
 * redessiné : un seul dessin pour tous les écrans vides. Trait fixe à
 * 1,75 px (`.icone`), en couleur secondaire : l'orange reste au bouton.
 */
export function EtatVide({
  titre,
  texte,
  titreBalise = "p",
  className = "",
  children,
}: {
  titre: React.ReactNode;
  texte?: React.ReactNode;
  /** `h2` quand l'état vide tient lieu de section (catalogue). */
  titreBalise?: "p" | "h2";
  className?: string;
  /** Les actions de l'écran : bouton, lien, ou rien. */
  children?: React.ReactNode;
}) {
  const Titre = titreBalise;
  return (
    <div className={className ? `etat-vide ${className}` : "etat-vide"}>
      <svg className="icone etat-vide-dessin" viewBox="0 0 120 100" aria-hidden="true" focusable="false">
        <path d="M15 43h90l-12-25H27L15 43Z M22 43v43h76V43 M48 86V60h24v26 M8 86h104 M37 18l-5 25 M60 18v25 M83 18l5 25" />
        <path d="M15 43c0 12 17 12 17 0 0 12 28 12 28 0 0 12 28 12 28 0 0 12 17 12 17 0" />
      </svg>
      <Titre className="etat-vide-titre">{titre}</Titre>
      {texte && <p className="etat-vide-texte">{texte}</p>}
      {children}
    </div>
  );
}
