"use client";

import { useEffect } from "react";

/**
 * ARRIVÉE SUR UNE ANCRE AU CHARGEMENT COMPLET (2026-10-19).
 *
 * `app/loading.tsx`, à la racine, fait passer chaque page par un squelette :
 * le vrai contenu arrive plus tard dans le flux, d'abord rangé dans un
 * `<div hidden>`, puis mis en place par React. Le navigateur cherche le
 * fragment trop tôt, et ne recommence pas. Mesuré à 360 px : un lien partagé
 * vers `/vendre#mes-produits` restait en haut de page (scrollY = 0).
 *
 * Ce composant, monté une fois dans le layout racine, attend que la cible
 * existe hors de tout `[hidden]`, puis la fait défiler à sa place :
 * `scrollIntoView` respecte la `scroll-margin` de la cible, et le glissé suit
 * `scroll-behavior` (direct quand le visiteur demande moins de mouvement,
 * `app/globals.css`).
 *
 * Il se retire au premier geste du visiteur (doigt, molette, clavier, clic) :
 * quelqu'un qui a commencé à lire ne doit pas être emporté. Rien sur un
 * rechargement ni un retour arrière, où le navigateur restaure la position ;
 * rien non plus pour les navigations internes, que Next.js fait défiler lui-même.
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

export function AncreAuChargement() {
  useEffect(() => {
    const id = idDeFragment(window.location.hash);
    if (!id) return;
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    if (nav && nav.type !== "navigate") return;

    const prete = (el: HTMLElement | null): el is HTMLElement => !!el && !el.closest("[hidden]");
    // Contenu déjà là et page déjà défilée : le navigateur a fait son travail.
    if (prete(document.getElementById(id)) && window.scrollY > 0) return;

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
  }, []);

  return null;
}
