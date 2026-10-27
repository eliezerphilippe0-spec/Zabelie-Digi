"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { appelAvecSession } from "@/lib/appel-session";

export type AccountActionsLabels = {
  exportData: string;
  delete: string;
  confirmTitle: string;
  /** Les conséquences, dites AVANT le geste irréversible. */
  confirmBody: string;
  confirm: string;
  cancel: string;
  deleting: string;
  /** Refus du serveur sans phrase lisible. */
  failed: string;
  /** La requête n'est jamais partie. */
  network: string;
};

/**
 * Mes données et mon compte : export, suppression.
 *
 * ⚠️ LA SUPPRESSION EST IRRÉVERSIBLE — et sa confirmation était un
 * `window.confirm` en français en dur (audit du 2026-10-27, M5) : boîte du
 * navigateur hors de la langue du vendeur, hors du thème, et que certains
 * navigateurs Android masquent après un premier refus. Elle se fait désormais
 * DANS la page, en deux temps : le premier clic ouvre un encadré qui dit les
 * conséquences, y place le focus, et n'offre que deux sorties explicites —
 * confirmer ou annuler (Échap annule aussi). Rien ne part avant le second clic.
 *
 * La route de suppression et ce qu'elle efface ne changent pas.
 */
export function AccountActions({ actorId, labels }: { actorId: string; labels: AccountActionsLabels }) {
  const router = useRouter();
  const [confirmation, setConfirmation] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  // Le focus suit l'étape, par des refs de rappel STABLES : appelées au
  // montage de l'élément seulement, jamais à chaque rendu (sinon un message
  // d'erreur ramènerait le focus sur l'encadré), et jamais au premier rendu
  // de la page pour le bouton (il ne reprend le focus qu'au retour d'annuler).
  const retourAuBouton = useRef(false);
  const focaliserEncadre = useCallback((el: HTMLDivElement | null) => {
    el?.focus();
  }, []);
  const focaliserBouton = useCallback((el: HTMLButtonElement | null) => {
    if (el && retourAuBouton.current) {
      retourAuBouton.current = false;
      el.focus();
    }
  }, []);

  function annuler() {
    if (busy) return;
    setMsg(null);
    retourAuBouton.current = true;
    setConfirmation(false);
  }

  async function supprimer() {
    setBusy(true);
    setMsg(null);
    const issue = await appelAvecSession("/api/account", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expectedActorId: actorId }),
    });
    if (issue.etat === "connexion") {
      router.push(issue.vers);
      return;
    }
    if (issue.etat !== "ok") {
      setMsg(issue.etat === "reseau" ? labels.network : (issue.error ?? labels.failed));
      setBusy(false);
      return;
    }
    /* Fin de session par le MÊME endpoint serveur que le bouton de
     * déconnexion : `signOut()` client ne révoquait que la session locale,
     * donc supprimer son compte laissait vivantes les sessions ouvertes
     * ailleurs. La route de suppression a déjà révoqué la session partout :
     * un échec de CET appel ne remet pas le compte en vie, il ne doit donc
     * pas afficher un échec de suppression. */
    // Le routeur affiche l'accueil ; le POST n'a pas à suivre son renvoi 303.
    await fetch("/api/auth/signout", { method: "POST", redirect: "manual" }).catch(() => undefined);
    router.push("/");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <a
          href="/api/account/export"
          className="bouton inline-flex min-h-11 items-center rounded-xl border border-line px-4 py-2.5 text-sm font-semibold text-cloud transition hover:border-accent"
        >
          {labels.exportData}
        </a>
        {!confirmation && (
          <button
            ref={focaliserBouton}
            type="button"
            onClick={() => setConfirmation(true)}
            className="min-h-11 rounded-xl border border-danger/40 px-4 py-2.5 text-sm font-semibold text-danger-text transition hover:bg-danger/10"
          >
            {labels.delete}
          </button>
        )}
      </div>

      {confirmation && (
        <div
          ref={focaliserEncadre}
          id="suppression-compte"
          role="region"
          tabIndex={-1}
          aria-labelledby="suppression-compte-titre"
          aria-describedby="suppression-compte-texte"
          onKeyDown={(e) => {
            if (e.key === "Escape") annuler();
          }}
          className="rounded-xl border border-danger/40 bg-danger/10 p-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-danger"
        >
          <p id="suppression-compte-titre" className="text-sm font-bold text-danger-text">
            {labels.confirmTitle}
          </p>
          <p id="suppression-compte-texte" className="mt-1 text-sm text-cloud">
            {labels.confirmBody}
          </p>
          {msg && (
            <p role="alert" className="mt-2 text-sm font-semibold text-danger-text">
              {msg}
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={supprimer}
              disabled={busy}
              aria-busy={busy}
              className="min-h-11 rounded-xl border border-danger bg-surface px-4 text-sm font-bold text-danger-text transition hover:bg-danger/10 disabled:opacity-60"
            >
              {busy ? labels.deleting : labels.confirm}
            </button>
            <button
              type="button"
              onClick={annuler}
              disabled={busy}
              className="min-h-11 rounded-xl border border-line bg-surface px-4 text-sm font-semibold text-cloud transition hover:border-accent disabled:opacity-60"
            >
              {labels.cancel}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
