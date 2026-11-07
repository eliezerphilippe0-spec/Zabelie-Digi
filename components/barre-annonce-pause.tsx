"use client";

import { useState } from "react";

import { Icone } from "@/components/icone";
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
      <Icone taille={16}>
        {arretee ? <path d="M7 5v14l11-7z" /> : <path d="M9 5v14M15 5v14" />}
      </Icone>
    </button>
  );
}
