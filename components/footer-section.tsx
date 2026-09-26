"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** Même seuil que `md:` (768 px) : sous lui, les rubriques du pied se replient. */
export const PIED_MOBILE = "(max-width: 767px)";

/**
 * Une rubrique du pied de page : accordéon sur téléphone, colonne ouverte au-delà.
 *
 * Rendue OUVERTE côté serveur : sans JavaScript (vieil Android, script qui
 * échoue), tout reste lisible. Le repli n'est qu'une amélioration, posée après
 * hydratation — le pied est sous la ligne de flottaison, rien ne saute à l'écran.
 *
 * Sur ordinateur, le titre n'est pas un bouton : le clic ne replie rien et le
 * titre sort de l'ordre de tabulation — seuls les liens restent des arrêts.
 */
export function FooterSection({ titre, children }: { titre: string; children: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const mq = window.matchMedia(PIED_MOBILE);
    const appliquer = () => {
      const el = ref.current;
      if (!el) return;
      el.open = !mq.matches;
      el.querySelector("summary")?.setAttribute("tabindex", mq.matches ? "0" : "-1");
    };
    appliquer();
    mq.addEventListener("change", appliquer);
    return () => mq.removeEventListener("change", appliquer);
  }, []);

  return (
    <details ref={ref} open className="footer-section group border-b border-on-chrome/15 md:border-0">
      <summary
        onClick={(e) => {
          if (!window.matchMedia(PIED_MOBILE).matches) e.preventDefault();
        }}
        className="flex min-h-11 cursor-pointer list-none [&::-webkit-details-marker]:hidden items-center justify-between md:min-h-0 md:cursor-default"
      >
        <h2 className="text-sm font-bold text-on-chrome">{titre}</h2>
        <span aria-hidden="true" className="text-lg leading-none text-on-chrome/80 transition-transform group-open:rotate-45 md:hidden">
          +
        </span>
      </summary>
      <div className="pb-3 md:mt-4 md:pb-0">{children}</div>
    </details>
  );
}
