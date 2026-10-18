/**
 * Icônes du Studio (menu, actions rapides, cartes de chiffres) : SVG inline,
 * zéro dépendance, comme `department-icons.tsx`. Grille 24×24, trait hérité
 * de la couleur du texte, `aria-hidden` : chaque icône accompagne un libellé
 * qui se suffit.
 */
export type NomIcone =
  | "accueil"
  | "analyse"
  | "projets"
  | "nouveau"
  | "modele"
  | "ventes"
  | "revenus"
  | "promo"
  | "aide"
  | "boutique"
  | "clients"
  | "calendrier"
  | "oeil"
  | "oeilBarre"
  | "produits"
  | "commandes"
  | "messages"
  | "compte"
  | "api"
  | "images"
  | "partage";

const TRACES: Record<NomIcone, React.ReactNode> = {
  accueil: <path d="M4 11.5 12 5l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5h-5v5H5a1 1 0 0 1-1-1z" />,
  analyse: (
    <>
      <path d="M4 20h16" />
      <path d="M7 16v-4m5 4V8m5 8v-6" />
    </>
  ),
  projets: <path d="M4 7a1 1 0 0 1 1-1h4.5l2 2H19a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" />,
  nouveau: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="M12 8.5v7M8.5 12h7" />
    </>
  ),
  modele: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M4 9h16M9 9v11" />
    </>
  ),
  ventes: (
    <>
      <path d="M6 8h12l-1 11H7z" />
      <path d="M9 8a3 3 0 0 1 6 0" />
    </>
  ),
  revenus: (
    <>
      <rect x="3.5" y="6.5" width="17" height="12" rx="2" />
      <path d="M16 12.5h1.5M3.5 10h17" />
    </>
  ),
  promo: (
    <>
      <path d="M4 12.6V5a1 1 0 0 1 1-1h7.6l7.4 7.4-8.6 8.6z" />
      <circle cx="8.5" cy="8.5" r="1.3" />
    </>
  ),
  aide: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M9.8 9.6a2.3 2.3 0 1 1 3.2 2.1c-.6.3-1 .8-1 1.4v.4M12 16.6v.1" />
    </>
  ),
  boutique: (
    <>
      <path d="M4 9.5 5.5 5h13L20 9.5" />
      <path d="M4 9.5a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0M5.5 12.5V19h13v-6.5M10 19v-4h4v4" />
    </>
  ),
  clients: (
    <>
      <circle cx="9" cy="9" r="3" />
      <path d="M3.5 19a5.5 5.5 0 0 1 11 0M15.5 6.4a3 3 0 0 1 0 5.2M17.5 14.2a5.5 5.5 0 0 1 3 4.8" />
    </>
  ),
  calendrier: (
    <>
      <rect x="4" y="5.5" width="16" height="14" rx="2" />
      <path d="M4 10h16M8.5 3.5v4m7-4v4" />
    </>
  ),
  oeil: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="2.8" />
    </>
  ),
  oeilBarre: (
    <>
      <path d="M9.9 6A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-2.6 3.4M6.6 7.3A16.5 16.5 0 0 0 2.5 12S6 18.5 12 18.5a9.4 9.4 0 0 0 4.6-1.2" />
      <path d="M10 10.2a2.8 2.8 0 0 0 3.9 3.9M4 4l16 16" />
    </>
  ),
  produits: (
    <>
      <path d="M12 3.5 20 7.8v8.4L12 20.5 4 16.2V7.8z" />
      <path d="M4 7.8 12 12l8-4.2M12 12v8.5" />
    </>
  ),
  commandes: (
    <>
      <path d="M3.5 6.5h10v9h-10zM13.5 9.5h3.6l3.4 3.4v2.6h-7" />
      <circle cx="7.5" cy="17.5" r="1.8" />
      <circle cx="16.5" cy="17.5" r="1.8" />
    </>
  ),
  messages: <path d="M4.5 6a1.5 1.5 0 0 1 1.5-1.5h12A1.5 1.5 0 0 1 19.5 6v8.5A1.5 1.5 0 0 1 18 16h-7.5L6 19.5V16a1.5 1.5 0 0 1-1.5-1.5z" />,
  compte: (
    <>
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5 19.5a7 7 0 0 1 14 0" />
    </>
  ),
  api: <path d="m8.5 8-4 4 4 4m7-8 4 4-4 4M13.5 6l-3 12" />,
  images: (
    <>
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="m4.5 17 5-4.5 3.5 3 2.5-2 4 3.5" />
    </>
  ),
  partage: (
    <>
      <circle cx="17" cy="6" r="2.3" />
      <circle cx="7" cy="12" r="2.3" />
      <circle cx="17" cy="18" r="2.3" />
      <path d="m9 11 6-3.8M9 13l6 3.8" />
    </>
  ),
};

export function IconeStudio({ nom, className = "h-5 w-5" }: { nom: NomIcone; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      className={`shrink-0 fill-none stroke-current ${className}`}
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {TRACES[nom]}
    </svg>
  );
}
