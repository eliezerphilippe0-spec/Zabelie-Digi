"use client";

import { useEffect, useRef } from "react";

/**
 * L'en-tête qui se RÉDUIT au défilement (brief accueil premium §3.3).
 *
 * Au repos : logo, recherche, chips des rayons — ~100 px. Après ~120 px de
 * défilement, l'attribut `data-compact` est posé sur le <header> et
 * `app/globals.css` masque tout ce qui porte `.header-fold` (logo, chips) :
 * il ne reste que la barre de recherche et les deux icônes, collées en haut.
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

  return (
    <header ref={ref} className={className} style={{ backgroundImage: "var(--brand-gradient)" }}>
      {children}
    </header>
  );
}
