import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

/**
 * LE BOUTON — un composant, quatre variantes, deux tailles (audit du système
 * de design du 2026-10-27, constat m5).
 *
 * Mesuré au commit `acc72c9` : 95 boutons orange (`bg-brand` + `text-on-brand`
 * hors pastilles `rounded-full`) écrits à la main, en 59 combinaisons de
 * classes distinctes une fois les marges retirées, dont 10 au rayon `rounded-lg`
 * alors que la RÈGLE DES RAYONS (`app/zabelie-theme.css`) donne `rounded-xl`
 * aux boutons. Rien n'était faux un par un ; c'est l'ensemble qui dérivait, un
 * `py-2` ici, un `font-bold` là. `tests/bouton-orange-cliquet.test.ts` compte
 * ceux qui restent, et ce compte ne peut que descendre.
 *
 * Ce que ce composant tient, et que chaque copie devait tenir seule :
 *   • `.bouton` — Manrope 700, la même déclaration que `button` (globals.css,
 *     `tests/boutons-typographie.test.ts`), lien ou bouton ;
 *   • le rayon des boutons, `rounded-xl` (`--radius-button` en est l'alias) ;
 *   • 44 px au moins (`min-h-11`, 48 en `lg`) — cible tactile ;
 *   • le focus clavier n'est PAS redéfini : la règle `:focus-visible` de la
 *     couche base s'applique telle quelle, dans les deux thèmes ;
 *   • `danger` écrit en `text-danger-text`, jamais `text-danger` (QA-A4 : les
 *     tokens de base sont des fonds à 3:1, pas du texte) ;
 *   • `chargement` GARDE LA LARGEUR : le libellé passe en `opacity-0` (et non
 *     `invisible`, qui le retirerait de l'arbre d'accessibilité et laisserait
 *     un bouton sans nom), pose `aria-busy` et désactive le clic — un double
 *     envoi sur un bouton de paiement est exactement ce qu'il faut empêcher ;
 *   • désactivé, il devient NEUTRE et lisible (`text-mist` sur `ink-soft`)
 *     plutôt qu'un orange à 60 % d'opacité dont le texte passait sous 4,5:1 ;
 *   • `<Link>` quand `href` est donné, `<button type="button">` sinon — le
 *     `type` par défaut empêche un envoi de formulaire accidentel.
 *
 * Mouvement : l'appui réduit à 0,97 en `transform` seul, durée par le token
 * (règle du thème) ; les survols changent une couleur SANS transition. Le
 * cercle de chargement tourne sous `motion-safe:` seulement (précédent :
 * `lang-toggle.tsx`) et reste immobile, mais visible, en mouvement réduit.
 *
 * Aucune directive : composant partagé, rendu aussi bien par une page serveur
 * que par un composant client (qui seul peut lui passer `onClick`).
 */

export type VarianteBouton = "primaire" | "secondaire" | "discret" | "danger";
export type TailleBouton = "md" | "lg";

/** L'apparence : une variante, ou l'état désactivé, qui ne ressemble à aucune. */
type Apparence = VarianteBouton | "inactif";

/** L'appui — `transform` seul, durée `--motion-fast` (règle du thème). */
const APPUI = "transition-transform duration-(--motion-fast) active:scale-[0.97]";

const APPARENCES: Record<Apparence, string> = {
  primaire: `${APPUI} border-brand bg-brand text-on-brand hover:bg-brand/90`,
  secondaire: `${APPUI} border-line bg-surface/60 text-cloud hover:border-accent/50`,
  discret: `${APPUI} border-transparent text-mist hover:text-cloud`,
  danger: `${APPUI} border-transparent text-danger-text hover:bg-danger/10`,
  inactif: "cursor-not-allowed border-line bg-ink-soft text-mist",
};

/**
 * Les classes d'un bouton. Écrites en UN gabarit, et pas en concaténation :
 * `tests/boutons-typographie.test.ts` (B2) sait lire une fonction fléchée qui
 * rend un gabarit, et vérifie donc que le lien rendu ici porte `.bouton`.
 */
const classesBouton = (apparence: Apparence, taille: TailleBouton, extra: string) =>
  `bouton relative inline-flex items-center justify-center gap-2 rounded-xl border text-center font-semibold aria-busy:cursor-progress ${taille === "lg" ? "min-h-12 px-6 py-3 text-base" : "min-h-11 px-5 py-2.5 text-sm"} ${APPARENCES[apparence]} ${extra}`;

type Commun = {
  variante?: VarianteBouton;
  taille?: TailleBouton;
  /** Marges et largeur : la mise en page appartient à l'appelant, pas le style. */
  className?: string;
  children: ReactNode;
};

type PropsLien = Commun & Omit<ComponentProps<typeof Link>, "className" | "children"> & { href: ComponentProps<typeof Link>["href"] };

type PropsBouton = Commun &
  Omit<ComponentProps<"button">, "className" | "children"> & {
    href?: undefined;
    /** Action en cours : largeur gardée, `aria-busy`, clic bloqué. */
    chargement?: boolean;
  };

export type PropsBoutonZabelie = PropsLien | PropsBouton;

function Cercle() {
  return (
    <span aria-hidden="true" className="absolute inset-0 grid place-items-center">
      <svg viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current motion-safe:animate-spin" strokeWidth="2">
        <path d="M12 3a9 9 0 1 1-9 9" />
      </svg>
    </span>
  );
}

export function Bouton(props: PropsBoutonZabelie) {
  if (props.href !== undefined) {
    const { variante = "primaire", taille = "md", className = "", children, ...lien } = props as PropsLien;
    return (
      <Link {...lien} className={classesBouton(variante, taille, className)}>
        {children}
      </Link>
    );
  }
  const {
    variante = "primaire",
    taille = "md",
    className = "",
    children,
    chargement = false,
    disabled = false,
    type = "button",
    ...bouton
  } = props as PropsBouton;
  /* En chargement, le bouton garde SA couleur : il n'est pas indisponible, il
     travaille. L'apparence neutre est réservée au vrai « désactivé ». */
  const apparence: Apparence = disabled && !chargement ? "inactif" : variante;
  return (
    <button
      {...bouton}
      type={type}
      disabled={disabled || chargement}
      aria-busy={chargement || undefined}
      className={classesBouton(apparence, taille, className)}
    >
      {chargement && <Cercle />}
      <span className={chargement ? "inline-flex items-center gap-2 opacity-0" : "inline-flex items-center gap-2"}>{children}</span>
    </button>
  );
}
