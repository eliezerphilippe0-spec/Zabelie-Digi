/**
 * Menu compte de l'en-tête — un `<details>` natif, ZÉRO JavaScript.
 *
 * Brief accueil premium §4.1 : l'en-tête ne garde qu'une ligne (logo,
 * recherche, panier, compte). Tout ce que la barre portait ailleurs — Aide,
 * Talents, Vendre, Tableau de bord, Messages, langue, thème, déconnexion —
 * vit ici, derrière une icône. `<details>` s'ouvre et se ferme sans
 * hydratation, donc AVANT que le JS n'arrive sur 3G, et se ferme au clic
 * hors du panneau grâce à `name`-less behaviour du navigateur… non : il ne se
 * ferme pas seul, et c'est accepté — une navigation recharge la page.
 *
 * Le panneau est une surface claire (`bg-surface text-cloud`) posée SUR le
 * chrome sombre : ses liens gardent les couleurs de texte du corps, pas
 * celles de l'en-tête.
 */
export function AccountMenu({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <details className="relative">
      <summary
        aria-label={label}
        title={label}
        className="inline-flex min-h-11 min-w-11 cursor-pointer list-none items-center justify-center rounded-xl text-on-chrome transition hover:bg-on-chrome/10 [&::-webkit-details-marker]:hidden"
      >
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className="h-6 w-6 fill-none stroke-current"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" />
        </svg>
      </summary>
      <div className="absolute right-0 top-full z-50 mt-2 w-64 rounded-2xl border border-line bg-surface p-2 text-cloud shadow-xl">
        {children}
      </div>
    </details>
  );
}

/** Un lien du menu compte : pleine largeur, cible tactile de 44 px. */
export const MENU_LINK =
  "flex min-h-11 items-center rounded-lg px-3 text-sm text-cloud transition hover:bg-brand/10";
