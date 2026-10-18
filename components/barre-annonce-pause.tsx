"use client";

import { useState } from "react";

/**
 * Le bouton pause de la barre d'annonce (WCAG 2.2.2). Il pose `data-pause`
 * sur la barre ; c'est la feuille `app/barre-annonce.css` qui arrête le
 * défilement. Libellés reçus en props : le dictionnaire reste côté serveur.
 */
export function BarreAnnoncePause({ pause, reprendre }: { pause: string; reprendre: string }) {
  const [arretee, setArretee] = useState(false);
  return (
    <button
      type="button"
      className="annonce-pause"
      aria-label={arretee ? reprendre : pause}
      title={arretee ? reprendre : pause}
      onClick={(e) => {
        const suivant = !arretee;
        setArretee(suivant);
        e.currentTarget.closest(".annonce")?.toggleAttribute("data-pause", suivant);
      }}
    >
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false" fill="currentColor">
        {arretee ? <path d="M4 2.5v11l9-5.5z" /> : <path d="M4 2.5h3v11H4zM9 2.5h3v11H9z" />}
      </svg>
    </button>
  );
}
