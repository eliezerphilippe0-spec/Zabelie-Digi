"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { IconeStudio } from "@/components/studio-icones";

/**
 * MASQUER LES MONTANTS (tasks/plan.md, phase T2 ; repris de Chariow, où l'on
 * cache ses chiffres avant de partager son écran ou de montrer son téléphone).
 *
 * Le serveur rend les vrais chiffres ; ce bouton ne fait que poser
 * `data-masque` sur la zone, et le CSS (`group-data-[masque]/montants`)
 * remplace chaque montant par des points. La préférence reste dans CE
 * navigateur : ce n'est pas un réglage de compte. Le libellé du bouton ne
 * change pas, c'est `aria-pressed` qui dit l'état aux lecteurs d'écran.
 */
const CLE = "zabelie:studio:montants-masques";
const EVENEMENT = "zabelie:montants-masques";

function lire(): boolean {
  try {
    return localStorage.getItem(CLE) === "1";
  } catch {
    return false;
  }
}

function abonner(rappel: () => void) {
  window.addEventListener("storage", rappel);
  window.addEventListener(EVENEMENT, rappel);
  return () => {
    window.removeEventListener("storage", rappel);
    window.removeEventListener(EVENEMENT, rappel);
  };
}

export function MontantsMasquables({
  titre,
  masquer,
  children,
}: {
  titre: string;
  masquer: string;
  children: ReactNode;
}) {
  const masque = useSyncExternalStore(abonner, lire, () => false);

  function basculer() {
    try {
      localStorage.setItem(CLE, masque ? "0" : "1");
    } catch {
      /* stockage refusé : le bouton reste sans effet durable */
    }
    window.dispatchEvent(new Event(EVENEMENT));
  }

  return (
    <div data-masque={masque ? "" : undefined} className="group/montants">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="chiffres-titre" className="text-lg font-semibold">{titre}</h2>
        <button
          type="button"
          aria-pressed={masque}
          onClick={basculer}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm text-mist hover:bg-line/40 hover:text-cloud focus-visible:outline focus-visible:outline-2"
        >
          <IconeStudio nom={masque ? "oeilBarre" : "oeil"} />
          {masquer}
        </button>
      </div>
      {children}
    </div>
  );
}

/** Un montant, remplacé par des points quand la zone est masquée. */
export function Montant({ valeur, masque }: { valeur: string; masque: string }) {
  return (
    <>
      <span className="group-data-[masque]/montants:hidden">{valeur}</span>
      <span className="hidden group-data-[masque]/montants:inline">
        <span aria-hidden="true">•••••</span>
        <span className="sr-only">{masque}</span>
      </span>
    </>
  );
}
