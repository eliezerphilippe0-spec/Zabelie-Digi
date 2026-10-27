"use client";

import { Suspense, useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * ARRIVÉE SUR UNE ANCRE — au chargement complet (2026-10-19) ET après une
 * navigation cliente (2026-10-27).
 *
 * ── Chargement complet ────────────────────────────────────────────────────
 * `app/loading.tsx`, à la racine, fait passer chaque page par un squelette :
 * le vrai contenu arrive plus tard dans le flux, d'abord rangé dans un
 * `<div hidden>`, puis mis en place par React. Le navigateur cherche le
 * fragment trop tôt, et ne recommence pas. Mesuré à 360 px : un lien partagé
 * vers `/vendre#mes-produits` restait en haut de page (scrollY = 0).
 *
 * ── Navigation cliente ────────────────────────────────────────────────────
 * Un segment qui porte son propre `loading.tsx` (`/vendre`, `/tableau-de-bord`,
 * `/produit/[slug]`…) est d'abord validé en SQUELETTE : l'adresse et le
 * fragment changent, Next cherche la cible dans le squelette, ne la trouve
 * pas, et tient l'intention pour traitée — `layout-router.js` (Next 16) :
 * « A missing hash target is still a handled scroll intent ». Quand la page
 * arrive en flux, personne ne recommence. Mesuré sur la branche
 * d'intégration de l'audit du 2026-10-27 : lien du tableau de bord vers
 * `/vendre#mes-produits`, aucun défilement, 10 fois sur 10.
 *
 * Ce composant, monté une fois dans le layout racine (qui persiste d'une
 * page à l'autre), relaie donc aussi chaque changement d'adresse (chemin ou
 * recherche) qui porte un fragment : il attend que la cible existe hors de
 * tout `[hidden]`, puis la fait défiler à sa place. `scrollIntoView` respecte
 * la `scroll-margin` de la cible, et le glissé suit `scroll-behavior` (direct
 * quand le visiteur demande moins de mouvement, `app/globals.css`).
 *
 * Ce qu'il ne fait JAMAIS :
 *   • rien sur un rechargement ni un retour arrière/avant (`popstate`) : la
 *     position restaurée prime ;
 *   • rien quand la cible est DÉJÀ là au moment où il passe : Next l'a amenée
 *     lui-même, dans un effet de mise en page qui précède celui-ci ;
 *   • rien après le premier geste du visiteur (doigt, molette, clavier,
 *     clic) : quelqu'un qui a commencé à lire ne doit pas être emporté ;
 *   • rien après 30 s.
 * Un changement de fragment SEUL (même chemin, même recherche) ne passe pas
 * ici : il ne charge rien, le navigateur et Next défilent eux-mêmes.
 */
const ATTENTE_MAX_MS = 30_000;
const GESTES = ["pointerdown", "touchstart", "wheel", "keydown"] as const;

/** L'id visé par le fragment, ou `null` s'il ne peut pas désigner un élément
 * du site (jetons d'authentification `#access_token=…`, fragment vide). */
export function idDeFragment(hash: string): string | null {
  let id: string;
  try {
    id = decodeURIComponent(hash.replace(/^#/, ""));
  } catch {
    return null;
  }
  return /^[\w-]+$/.test(id) ? id : null;
}

/** Une cible est prête quand elle existe hors du `<div hidden>` du flux. */
const prete = (el: HTMLElement | null): el is HTMLElement => !!el && !el.closest("[hidden]");

/**
 * Attend que l'élément `id` soit prêt, puis le fait défiler à sa place. Se
 * retire au premier geste, au bout de 30 s, ou quand on l'arrête. Rend
 * l'arrêt.
 */
function attendrePuisDefiler(id: string): () => void {
  let fini = false;
  const observateur = new MutationObserver(() => tenter());
  const arreter = () => {
    if (fini) return;
    fini = true;
    observateur.disconnect();
    window.clearTimeout(minuterie);
    for (const geste of GESTES) window.removeEventListener(geste, arreter, true);
  };
  const tenter = () => {
    const cible = document.getElementById(id);
    if (fini || !prete(cible)) return;
    arreter();
    cible.scrollIntoView({ block: "start" });
  };
  const minuterie = window.setTimeout(arreter, ATTENTE_MAX_MS);

  for (const geste of GESTES) window.addEventListener(geste, arreter, { capture: true, passive: true });
  observateur.observe(document.body, { childList: true, subtree: true });
  tenter();
  return arreter;
}

/** `useSearchParams` exige une frontière Suspense : sans elle, une page rendue
 *  statiquement basculerait entière en rendu client. */
export function AncreAuChargement() {
  return (
    <Suspense fallback={null}>
      <AncreSurNavigation />
    </Suspense>
  );
}

function AncreSurNavigation() {
  const chemin = usePathname();
  const recherche = useSearchParams()?.toString() ?? "";
  const premier = useRef(true);
  /** L'adresse atteinte par le dernier retour arrière/avant, s'il y en a un. */
  const retour = useRef<string | null>(null);

  useEffect(() => {
    const surRetour = () => {
      retour.current = window.location.href;
    };
    window.addEventListener("popstate", surRetour);
    return () => window.removeEventListener("popstate", surRetour);
  }, []);

  useEffect(() => {
    const chargement = premier.current;
    premier.current = false;
    const parRetour = retour.current === window.location.href;
    retour.current = null;

    const id = idDeFragment(window.location.hash);
    if (!id) return;
    if (chargement) {
      const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
      if (nav && nav.type !== "navigate") return;
      // Contenu déjà là et page déjà défilée : le navigateur a fait son travail.
      if (prete(document.getElementById(id)) && window.scrollY > 0) return;
    } else {
      // Retour arrière/avant : la position restaurée prime.
      if (parRetour) return;
      // Cible déjà là : Next l'a amenée lui-même (effet de mise en page, avant celui-ci).
      if (prete(document.getElementById(id))) return;
    }
    return attendrePuisDefiler(id);
  }, [chemin, recherche]);

  return null;
}
