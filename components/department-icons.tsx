/**
 * Icônes des 16 départements (`0035`) — SVG inline, zéro dépendance.
 *
 * Lucide aurait été plus joli et aurait coûté un paquet npm pour seize
 * pictogrammes : contraire à « aucune dépendance UI nouvelle ». Tracés à la
 * main sur la grille 24×24, `stroke` hérité du parent (la couleur suit le
 * texte), `aria-hidden` — l'icône décore un libellé qui se suffit.
 *
 * Un slug inconnu (département ajouté en base après coup) tombe sur l'icône
 * générique : l'ajout d'un rayon ne doit jamais attendre un déploiement.
 */

const TRACES: Record<string, React.ReactNode> = {
  "otomobil-moto": (
    <>
      <path d="M4 15l1.5-4.5A2 2 0 017.4 9h9.2a2 2 0 011.9 1.5L20 15" />
      <path d="M3 15h18v3h-2m-14 0H3v-3z" />
      <circle cx="7.5" cy="18" r="1.5" />
      <circle cx="16.5" cy="18" r="1.5" />
    </>
  ),
  elektwonik: (
    <>
      <rect x="4" y="5" width="16" height="11" rx="1.5" />
      <path d="M9 20h6m-3-4v4" />
    </>
  ),
  "mod-akseswa": (
    <path d="M12 5l-2-1-6 3 2 3 2-1v10h8V9l2 1 2-3-6-3-2 1z" />
  ),
  soulye: (
    <path d="M3 16c0-1 .5-5 1-6l3 1 2-2c4 2 8 3 11 3.5 1 .2 1 1.5 1 2.5v1H3z" />
  ),
  "sak-bagay": (
    <>
      <path d="M6 9h12l1 11H5L6 9z" />
      <path d="M9 9V7a3 3 0 016 0v2" />
    </>
  ),
  "bote-swen": (
    <>
      <path d="M9 3h6v4H9z" />
      <path d="M10 7h4l1 4v9a1 1 0 01-1 1h-4a1 1 0 01-1-1v-9l1-4z" />
    </>
  ),
  "savon-netwayaj": (
    <>
      <rect x="5" y="9" width="10" height="8" rx="2" />
      <circle cx="18" cy="7" r="1.5" />
      <circle cx="16" cy="12" r="1" />
    </>
  ),
  "manje-machandiz": (
    <>
      <path d="M4 7h16l-1.5 13h-13L4 7z" />
      <path d="M9 7a3 3 0 016 0" />
    </>
  ),
  "mache-agrikol": (
    <>
      <path d="M12 21c-5 0-8-3-8-8 5 0 8 3 8 8zm0 0c0-6 3-10 8-11 0 6-3 10-8 11z" />
    </>
  ),
  "kay-kizin": (
    <>
      <path d="M4 11l8-7 8 7" />
      <path d="M6 10v10h12V10" />
    </>
  ),
  "sante-byennet": (
    <path d="M12 20s-7-4.5-7-10a4 4 0 017-2.5A4 4 0 0119 10c0 5.5-7 10-7 10z" />
  ),
  "espo-lwazi": (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 4c2.5 2 2.5 14 0 16M4 12h16" />
    </>
  ),
  "liv-papet": (
    <>
      <path d="M5 4h6v16H5a1 1 0 01-1-1V5a1 1 0 011-1zm14 0h-6v16h6a1 1 0 001-1V5a1 1 0 00-1-1z" />
    </>
  ),
  "timoun-bebe": (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M6 20c0-3 3-5 6-5s6 2 6 5" />
    </>
  ),
  "atizana-kado": (
    <>
      <rect x="4" y="9" width="16" height="11" rx="1" />
      <path d="M4 12h16M12 9v11m0-11c-2 0-4-1-4-3a2 2 0 014 0m0 3c2 0 4-1 4-3a2 2 0 00-4 0" />
    </>
  ),
  "dijital-sevis": (
    <>
      <rect x="7" y="3" width="10" height="18" rx="2" />
      <path d="M11 18h2" />
    </>
  ),
};

const GENERIQUE = (
  <>
    <rect x="4" y="4" width="7" height="7" rx="1" />
    <rect x="13" y="4" width="7" height="7" rx="1" />
    <rect x="4" y="13" width="7" height="7" rx="1" />
    <rect x="13" y="13" width="7" height="7" rx="1" />
  </>
);

export function DepartmentIcon({
  slug,
  className,
}: {
  slug: string;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      fill="none"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {TRACES[slug] ?? GENERIQUE}
    </svg>
  );
}
