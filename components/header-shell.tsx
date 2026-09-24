"use client";

import { useEffect, useRef } from "react";

/**
 * L'en-tête qui se RÉDUIT au défilement (brief accueil premium §3.3).
 *
 * Au repos : logo, recherche, chips des rayons — ~100 px. Après ~120 px de
 * défilement, l'attribut `data-compact` est posé sur le <header> et
 * `app/globals.css` masque tout ce qui porte `.header-fold` (logo, chips) :
 * la recherche et les raccourcis restent collés en haut. Sur mobile,
 * la recherche conserve sa propre ligne pour rester lisible.
 *
 * ⚠️ AUCUNE animation de hauteur — la règle du brief est « transform et
 * opacity seulement ». Le pli est instantané (`display: none`), ce qui coûte
 * un seul reflow et rien pendant le défilement. Hystérésis (120 px pour
 * plier, 40 px pour déplier) : sans elle, un défilement lent autour du seuil
 * fait battre l'en-tête.
 *
 * Écouteur `passive`, une seule lecture de `scrollY` par événement, un seul
 * `toggleAttribute` quand l'état CHANGE : c'est tout ce que ce composant
 * coûte à un Android d'entrée de gamme. Il rend le `<header>` lui-même pour
 * que le serveur puisse y déposer son contenu tel quel (children).
 */
export function HeaderShell({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let compact = false;
    const lire = () => {
      const y = window.scrollY;
      const suivant = compact ? y > 40 : y > 120;
      if (suivant !== compact) {
        compact = suivant;
        el.toggleAttribute("data-compact", compact);
      }
    };
    window.addEventListener("scroll", lire, { passive: true });
    lire();
    return () => window.removeEventListener("scroll", lire);
  }, []);

  // Keep native disclosures usable without JS; enhance their dismissal and bounds.
  useEffect(() => {
    const header = ref.current;
    if (!header) return;
    const openMenus = () => header.querySelectorAll<HTMLDetailsElement>("details[data-header-menu][open]");
    const closeMenus = () => openMenus().forEach(menu => { menu.open = false; });
    function positionMenu(menu: HTMLDetailsElement) {
      const panel = menu.querySelector<HTMLElement>(":scope > .header-menu-panel");
      if (!panel) return;
      panel.style.setProperty("--header-menu-shift", "0px");
      const box = panel.getBoundingClientRect();
      const shift = Math.max(12 - box.left, Math.min(0, window.innerWidth - 12 - box.right));
      panel.style.setProperty("--header-menu-shift", shift + "px");
      panel.style.setProperty("--header-menu-top", box.top + "px");
    }
    function onToggle(event: Event) {
      const menu = event.target;
      if (menu instanceof HTMLDetailsElement && menu.open && menu.hasAttribute("data-header-menu")) positionMenu(menu);
    }
    let frame = 0;
    function followScroll() {
      if (frame || !openMenus().length) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        openMenus().forEach(positionMenu);
      });
    }
    function outside(event: Event) {
      if (!(event.target instanceof Node)) return;
      const target = event.target;
      openMenus().forEach(menu => { if (!menu.contains(target)) menu.open = false; });
    }
    function escape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      openMenus().forEach(menu => {
        event.preventDefault();
        menu.open = false;
        menu.querySelector("summary")?.focus({ preventScroll: true });
      });
    }
    function navigate(event: MouseEvent) {
      if (event.target instanceof Element && event.target.closest("details[data-header-menu] a[href]")) closeMenus();
    }
    header.addEventListener("toggle", onToggle, true);
    header.addEventListener("click", navigate);
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("focusin", outside);
    document.addEventListener("keydown", escape);
    window.addEventListener("scroll", followScroll, { passive: true });
    window.addEventListener("resize", closeMenus);
    return () => {
      header.removeEventListener("toggle", onToggle, true);
      header.removeEventListener("click", navigate);
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("focusin", outside);
      document.removeEventListener("keydown", escape);
      window.removeEventListener("scroll", followScroll);
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", closeMenus);
    };
  }, []);

  return (
    <header ref={ref} className={className} style={{ backgroundImage: "var(--brand-gradient)" }}>
      {children}
    </header>
  );
}
