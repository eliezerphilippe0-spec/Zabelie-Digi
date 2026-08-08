"use client";

import { useEffect, useState } from "react";

/**
 * Indicateur « En ligne / Hors ligne » — v1 volontairement simple :
 * `navigator.onLine` + écouteurs `online`/`offline`. Pas de service worker,
 * pas de file hors-ligne (lot ultérieur).
 *
 * Accessibilité : la couleur ne porte jamais seule l'information — le libellé
 * texte est toujours rendu (variante `dot` : `aria-label` + `title`).
 * Les annonces de bascule passent par une zone `role="status"` (aria-live
 * poli) : un lecteur d'écran entend le changement sans être interrompu.
 *
 * Admin = français en dur, convention des pages admin existantes.
 */
const MSG_OFFLINE = "Connexion perdue — vos actions ne seront pas enregistrées.";
const MSG_ONLINE = "Connexion rétablie.";

export function OnlineStatus({ variant = "label" }: { variant?: "label" | "dot" }) {
  // `true` au premier rendu serveur : l'hydratation corrige immédiatement, et
  // un flash « hors ligne » injustifié serait pire que l'inverse.
  const [enLigne, setEnLigne] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    setEnLigne(navigator.onLine);
    let minuterie: ReturnType<typeof setTimeout>;
    const bascule = (etat: boolean) => () => {
      setEnLigne(etat);
      setToast(etat ? MSG_ONLINE : MSG_OFFLINE);
      clearTimeout(minuterie);
      // Le toast de reconnexion s'efface ; celui de coupure RESTE affiché
      // tant que la coupure dure — c'est une information d'état, pas un événement.
      if (etat) minuterie = setTimeout(() => setToast(null), 4000);
    };
    const on = bascule(true);
    const off = bascule(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
      clearTimeout(minuterie);
    };
  }, []);

  const libelle = enLigne ? "En ligne" : "Hors ligne";
  const pastille = (
    <span
      aria-hidden="true"
      className={`inline-block h-2 w-2 shrink-0 rounded-full ${
        enLigne ? "bg-success" : "bg-danger"
      }`}
    />
  );

  return (
    <>
      {variant === "dot" ? (
        <span aria-label={libelle} title={libelle} className="inline-flex">
          {pastille}
        </span>
      ) : (
        <span className="inline-flex items-center gap-1.5 text-xs text-mist">
          {pastille}
          {libelle}
        </span>
      )}
      {/* Zone d'annonce : rendue en permanence (aria-live exige d'exister
          AVANT le changement pour être annoncée), contenu seul conditionnel. */}
      <span role="status" aria-live="polite" className="sr-only-anchor contents">
        {toast && (
          <span className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm text-cloud shadow-xl">
            {toast}
          </span>
        )}
      </span>
    </>
  );
}
