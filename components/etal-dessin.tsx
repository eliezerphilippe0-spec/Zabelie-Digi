import type { CSSProperties, Ref } from "react";

/**
 * L'ÉTAL DE « OUVRIR MA BOUTIQUE » (V-23).
 *
 * C'est l'étal de `components/home-vivant.tsx` (auvent rayé à festons, soleil à
 * la manière de la peinture naïve, comptoir, les quatre familles d'offres) avec
 * une enseigne suspendue en plus. Même règle que le décor de l'accueil : aucun
 * produit, aucun prix, aucun vendeur, et `aria-hidden`. Le seul texte est le
 * nom que le VISITEUR a écrit, ou « Votre boutique » : la figure ne promet rien.
 *
 * `anime` : chaque pièce porte sa fenêtre (`--a` départ, `--d` durée) dans la
 * progression de l'acte, et `app/ouvrir-ma-boutique/etal.css` la dessine trait
 * par trait. Sans `anime` (le colophon), l'étal est fini.
 *
 * Couleurs posées en dur, comme dans `home-vivant.tsx` : une illustration ne
 * bascule pas avec le thème.
 */

const INDIGO = "#17123a";
const INDIGO_2 = "#2b3050";
const BORDEAUX = "#4a2731";
const ORANGE = "#e0580f";
const CREME = "#fffdf9";
const PECHE = "#f6c9a6";
const SABLE = "#e9e1d6";
const FILET = "#e8e3dc";

/** Festons d'un auvent : `n` arrondis de largeur `l`, posés sur la ligne `y`. */
function festons(x: number, y: number, n: number, l: number): string {
  let d = `M${x} ${y}`;
  for (let i = 0; i < n; i++) d += `c0 ${(l * 0.7).toFixed(2)} ${l.toFixed(2)} ${(l * 0.7).toFixed(2)} ${l.toFixed(2)} 0`;
  return `${d}z`;
}

/** Tuile arrondie de 64 × 64 au point (x, 262), rayon 14. */
const tuile = (x: number) =>
  `M${x + 14} 262h36a14 14 0 0 1 14 14v36a14 14 0 0 1-14 14h-36a14 14 0 0 1-14-14v-36a14 14 0 0 1 14-14z`;

/** Les quatre familles : objet, fichier, service, recharge (mêmes tracés que l'accueil). */
const FAMILLES = [
  <><path d="M5 8h14l-1 12H6z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></>,
  <><path d="M14 3H6v18h12V7z" /><path d="M14 3v4h4" /><path d="M12 11v6M9.5 14.5 12 17l2.5-2.5" /></>,
  <><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M9 7V5h6v2M3 12h18" /></>,
  <><rect x="7" y="2.5" width="10" height="19" rx="2" /><path d="m12.5 7-2 4h3l-2 4" /></>,
];
const TUILES_X = [96, 172, 248, 324];

const BANDES = [
  { d: "M64 96h32v44H62z", fill: CREME },
  { d: "M96 96h32l-4 44H96z", fill: ORANGE },
  { d: "M160 96h32l-2 44h-30z", fill: ORANGE },
  { d: "M224 96h32v44h-32z", fill: ORANGE },
  { d: "M288 96h32l2 44h-30z", fill: ORANGE },
  { d: "M352 96h32l4 44h-32z", fill: ORANGE },
];

/** Fenêtre d'une pièce dans la progression de l'acte. */
const f = (a: number, d: number) => ({ "--a": a, "--d": d }) as CSSProperties;

export function EtalDessin({
  nom,
  anime = false,
  texteRef,
  className = "",
}: {
  nom: string;
  anime?: boolean;
  texteRef?: Ref<SVGTextElement>;
  className?: string;
}) {
  const a = anime;
  return (
    <svg className={`etal ${a ? "etal--anime" : ""} ${className}`} viewBox="0 0 480 440" aria-hidden="true" focusable="false">
      <path className="etal-sol" d="M0 392.5h480" />
      <g className="etal-soleil" style={a ? f(0.84, 0.12) : undefined}>
        <path d="M358 78a34 34 0 1 0 68 0a34 34 0 1 0-68 0z" fill={PECHE} />
        <path d="M392 28V16M392 128v12M342 78h-12M442 78h12M357 43l-9-9M427 113l9 9M357 113l-9 9M427 43l9-9" fill="none" stroke={PECHE} strokeWidth="6" strokeLinecap="round" />
      </g>
      <path className="etal-colline" style={a ? f(0, 0.08) : undefined} d="M0 300c70-46 140-58 210-30s150 20 270-36v206H0z" fill={SABLE} />
      <path className="etal-trait" pathLength={1} style={a ? f(0.04, 0.11) : undefined} d="M74 370V120" fill="none" stroke={INDIGO_2} strokeWidth="8" strokeLinecap="round" />
      <path className="etal-trait" pathLength={1} style={a ? f(0.07, 0.11) : undefined} d="M406 370V120" fill="none" stroke={INDIGO_2} strokeWidth="8" strokeLinecap="round" />
      <path className="etal-trait" pathLength={1} style={a ? f(0.13, 0.1) : undefined} d="M62 330h356a6 6 0 0 1 6 6v10a6 6 0 0 1-6 6H62a6 6 0 0 1-6-6v-10a6 6 0 0 1 6-6z" fill={INDIGO} stroke={INDIGO} strokeWidth="2" />
      <path className="etal-trait" pathLength={1} style={a ? f(0.17, 0.09) : undefined} d="M70 352h340v40H70z" fill={INDIGO_2} stroke={INDIGO_2} strokeWidth="2" />
      <path className="etal-trait" pathLength={1} style={a ? f(0.24, 0.1) : undefined} d="M48 96h384l-14 44H62z" fill={INDIGO} stroke={INDIGO} strokeWidth="2" />
      {BANDES.map((b, i) => (
        <path key={b.d} className="etal-bande" style={a ? f(0.33 + i * 0.03, 0.07) : undefined} d={b.d} fill={b.fill} />
      ))}
      <path className="etal-trait" pathLength={1} style={a ? f(0.5, 0.07) : undefined} d={festons(62, 140, 22, 356 / 22)} fill={INDIGO} stroke={INDIGO} strokeWidth="1.5" />
      <path className="etal-trait" pathLength={1} style={a ? f(0.2, 0.07) : undefined} d="M46 92h388a6 6 0 0 1 0 12H46a6 6 0 0 1 0-12z" fill={BORDEAUX} stroke={BORDEAUX} strokeWidth="2" />

      <g className="etal-enseigne" style={a ? f(0.56, 0.12) : undefined}>
        <path d="M150 151v22M330 151v22" stroke={INDIGO_2} strokeWidth="2.5" strokeLinecap="round" />
        <path d="M120 172h240a8 8 0 0 1 8 8v42a8 8 0 0 1-8 8H120a8 8 0 0 1-8-8v-42a8 8 0 0 1 8-8z" fill={CREME} stroke={ORANGE} strokeWidth="3" />
        <text ref={texteRef} className="etal-nom" style={a ? f(0.64, 0.2) : undefined} x="240" y="202" textAnchor="middle" dominantBaseline="central" fontSize="30">
          {nom}
        </text>
        {a && (
          <g className="etal-pinceau" style={f(0.64, 0.2)}>
            <path d="M17 -18 36 -44" stroke={BORDEAUX} strokeWidth="5" strokeLinecap="round" />
            <path d="M8 -14l9 7 5-6-9-7z" fill={INDIGO_2} />
            <path d="M0 2c-3-5-1-12 6-15l9 7c-2 5-7 9-15 8z" fill={ORANGE} />
          </g>
        )}
      </g>

      {TUILES_X.map((x, i) => {
        const sombre = i === 3;
        return (
          <g key={x} className="etal-tuile" style={a ? f(0.8 + i * 0.025, 0.07) : undefined}>
            <path d={tuile(x)} fill={sombre ? INDIGO : CREME} stroke={sombre ? INDIGO : FILET} strokeWidth="1.5" />
            <g transform={`translate(${x + 15.2} 277.2) scale(1.4)`} fill="none" stroke={sombre ? CREME : INDIGO} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              {FAMILLES[i]}
            </g>
          </g>
        );
      })}
    </svg>
  );
}
