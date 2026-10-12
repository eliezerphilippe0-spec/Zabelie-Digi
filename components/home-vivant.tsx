/**
 * ACCUEIL VIVANT — décors de l'accueil (V-22, décision porteur du 2026-10-12).
 *
 * Deux illustrations SVG, sans texte, sans produit, sans prix, sans vendeur :
 * ce ne sont pas des offres, ce sont des décors. Rien à traduire, rien à
 * promettre — et `aria-hidden`, un lecteur d'écran n'a rien à en tirer.
 *
 * Leurs couleurs sont celles du mode CLAIR, posées en dur comme dans une
 * image : une illustration ne bascule pas avec le thème, une photo non plus.
 * Le cadre qui les porte, lui, suit les tokens (`app/home-vivant.css`).
 *
 * Aucune dépendance, aucun JavaScript client : composants serveur.
 */

const INDIGO = "#17123a";
const INDIGO_2 = "#2b3050";
const BORDEAUX = "#4a2731";
const ORANGE = "#e0580f";
const CREME = "#fffdf9";

/** Festons d'un auvent : `n` arrondis de largeur `l`, posés sur la ligne `y`. */
function festons(x: number, y: number, n: number, l: number): string {
  let d = `M${x} ${y}`;
  for (let i = 0; i < n; i++) d += `c0 ${l * 0.7} ${l} ${l * 0.7} ${l} 0`;
  return `${d}z`;
}

/** Les quatre familles d'offres de la place : objet, fichier, service, recharge. */
const FAMILLES = [
  <><path d="M5 8h14l-1 12H6z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></>,
  <><path d="M14 3H6v18h12V7z" /><path d="M14 3v4h4" /><path d="M12 11v6M9.5 14.5 12 17l2.5-2.5" /></>,
  <><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M9 7V5h6v2M3 12h18" /></>,
  <><rect x="7" y="2.5" width="10" height="19" rx="2" /><path d="m12.5 7-2 4h3l-2 4" /></>,
];

/**
 * VITRINE DE LANCEMENT — la moitié droite de la bannière tant que le catalogue
 * est vide (`opening`). Un étal de marché : auvent rayé à festons, soleil à la
 * manière de la peinture naïve haïtienne, comptoir, et les quatre familles
 * d'offres en tuiles. Une vraie photo de vendeur·se la remplacera (V-21 §2,
 * remplacée par V-22 en attendant).
 */
export function HomeVitrine() {
  return (
    <div className="home-vitrine" aria-hidden="true">
      <svg className="home-vitrine-scene" viewBox="0 0 480 432" preserveAspectRatio="xMidYMid slice" focusable="false">
        <g transform="translate(392 78)" fill="#f6c9a6" stroke="#f6c9a6" strokeWidth="6" strokeLinecap="round">
          <circle r="34" stroke="none" />
          <path d="M0-50v-12M0 50v12M-50 0h-12M50 0h12M-35-35l-9-9M35 35l9 9M-35 35l-9 9M35-35l9-9" fill="none" />
        </g>
        <path d="M0 300c70-46 140-58 210-30s150 20 270-36v198H0z" fill="#e9e1d6" />
        <rect x="70" y="120" width="8" height="250" rx="3" fill={INDIGO_2} />
        <rect x="402" y="120" width="8" height="250" rx="3" fill={INDIGO_2} />
        <path d="M48 96h384l-14 44H62z" fill={INDIGO} />
        <g fill={ORANGE}>
          <path d="M96 96h32l-4 44H96z" />
          <path d="M160 96h32l-2 44h-30z" />
          <path d="M224 96h32v44h-32z" />
          <path d="M288 96h32l2 44h-30z" />
          <path d="M352 96h32l4 44h-32z" />
        </g>
        <path d="M64 96h32v44H62z" fill={CREME} />
        <path d={festons(62, 140, 22, 356 / 22)} fill={INDIGO} />
        <rect x="40" y="92" width="400" height="12" rx="6" fill={BORDEAUX} />
        <rect x="56" y="330" width="368" height="22" rx="6" fill={INDIGO} />
        <rect x="70" y="352" width="340" height="40" fill={INDIGO_2} />
      </svg>
      {FAMILLES.map((icone, i) => (
        <span key={i} className="home-vitrine-tile">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" focusable="false">
            {icone}
          </svg>
        </span>
      ))}
    </div>
  );
}

/**
 * BOUTIQUE EN PRÉPARATION — à côté de « Le catalogue prend forme ». Rendue
 * seulement quand le catalogue a répondu VIDE : sur une erreur de chargement,
 * dire « on prépare » serait faux (`app/page.tsx`).
 */
export function HomeChantier() {
  return (
    <svg className="home-chantier-art" viewBox="0 0 220 170" aria-hidden="true" focusable="false">
      <rect width="220" height="170" rx="16" fill="#f2eee7" />
      <rect x="34" y="62" width="152" height="86" rx="4" fill={CREME} stroke={INDIGO} strokeWidth="2.5" />
      <path d="M26 40h168l-10 26H36z" fill={INDIGO} />
      <g fill={ORANGE}>
        <path d="M58 40h22l-3 26H58z" />
        <path d="M102 40h22v26h-22z" />
        <path d="M146 40h22l3 26h-22z" />
      </g>
      <path d={festons(36, 66, 14, 148 / 14)} fill={INDIGO} />
      <rect x="52" y="92" width="44" height="56" rx="3" fill="#e7e6f0" stroke={INDIGO} strokeWidth="2" />
      <rect x="112" y="92" width="58" height="32" rx="3" fill={CREME} stroke={INDIGO} strokeWidth="2" strokeDasharray="4 4" />
      <path d="M128 108h26" stroke={ORANGE} strokeWidth="4" strokeLinecap="round" />
      <path d="M184 150 200 86M196 150l16-64M188 134h14M192 118h14M196 102h14" stroke={BORDEAUX} strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
