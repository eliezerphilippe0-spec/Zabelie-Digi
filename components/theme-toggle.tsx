"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/** Le cookie du thème — lu par layout.tsx au rendu SERVEUR : la page arrive
 * déjà dans le bon thème, aucun flash. Recopié dans tests/theme.test.ts qui
 * croise les deux définitions. */
export const THEME_COOKIE = "zab_theme";

/**
 * Bascule sombre / clair. Deux gestes en un clic :
 *   1. `data-theme` sur <html> — bascule IMMÉDIATE, sans rechargement (les
 *      utilitaires Tailwind lisent var(--color-*), redéfinies par le thème) ;
 *   2. le cookie — pour que le PROCHAIN rendu serveur parte du bon thème.
 *
 * Le libellé est le symbole du thème CIBLE (☾ quand on est en clair, ☀ en
 * sombre) — même logique que le sélecteur de langue : montrer où l'on va.
 * `aria-label` vient des props : `t()` est interdit côté client.
 */
export function ThemeToggle({
  labelToLight,
  labelToDark,
}: {
  labelToLight: string;
  labelToDark: string;
}) {
  const router = useRouter();
  // L'état initial vient du DOM (posé par le serveur) — jamais deviné.
  const [clair, setClair] = useState(false);
  useEffect(() => {
    setClair(document.documentElement.dataset.theme === "light");
  }, []);

  function basculer() {
    const prochain = clair ? "dark" : "light";
    document.documentElement.dataset.theme = prochain;
    document.cookie = `${THEME_COOKIE}=${prochain}; path=/; max-age=31536000; samesite=lax`;
    setClair(!clair);
    router.refresh();
  }

  return (
    <button
      onClick={basculer}
      aria-label={clair ? labelToDark : labelToLight}
      title={clair ? labelToDark : labelToLight}
      className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md px-2 text-sm transition hover:opacity-80"
    >
      <span aria-hidden="true">{clair ? "☾" : "☀"}</span>
    </button>
  );
}
