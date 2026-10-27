"use client";

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { appelAvecSession } from "@/lib/appel-session";

export type RemoveFromCartLabels = {
  /** Texte visible du bouton (« Retirer »). */
  remove: string;
  /** Nom accessible, avec le titre : cinq boutons « Retirer » ne se distinguent pas au lecteur d'écran. */
  aria: string;
  /** Le serveur a répondu non (refus, panne) : le retrait n'a pas eu lieu. */
  error: string;
  /** La requête n'est jamais partie : seul cas où la connexion est en cause. */
  offline: string;
  retry: string;
};

/**
 * Retrait d'une ligne du panier — un geste, pas un écran.
 *
 * ⚠️ La version précédente faisait `try { await fetch(…) } finally { … }`,
 * SANS `catch` : hors ligne, `fetch` levait, la promesse rejetée n'était
 * gérée par personne et RIEN ne s'affichait. L'acheteur appuyait, rien ne
 * bougeait, et il concluait que le bouton ne marchait pas (audit du
 * 2026-10-27, m11). Désormais le retrait passe par la porte des appels
 * authentifiés (`lib/appel-session.ts`) et ses quatre issues :
 *   • `ok`        → on relit le serveur, la ligne disparaît ;
 *   • `connexion` → vers la connexion, retour au panier ;
 *   • `refus`     → le retrait n'a PAS eu lieu, et l'écran le dit ;
 *   • `reseau`    → idem, en nommant la vraie cause.
 * Dans les deux derniers cas, « Réessayer » relance le même geste.
 */
export function RemoveFromCart({
  productId,
  labels,
}: {
  productId: string;
  labels: RemoveFromCartLabels;
}) {
  const router = useRouter();
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const verrou = useRef(false);
  const idErreur = useId();

  async function retirer() {
    if (verrou.current) return;
    verrou.current = true;
    setEnvoi(true);
    setErreur(null);
    try {
      const issue = await appelAvecSession(
        `/api/panier?productId=${encodeURIComponent(productId)}`,
        { method: "DELETE" },
        "/panier",
      );
      if (issue.etat === "connexion") {
        window.location.assign(issue.vers);
        return;
      }
      if (issue.etat === "ok") {
        // Relire le serveur : la ligne disparaît parce qu'elle n'est PLUS en
        // base, jamais parce que l'écran l'a supposé.
        router.refresh();
      } else {
        setErreur(issue.etat === "reseau" ? labels.offline : labels.error);
      }
    } catch {
      setErreur(labels.error);
    } finally {
      verrou.current = false;
      setEnvoi(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={retirer}
        disabled={envoi}
        aria-busy={envoi}
        aria-label={labels.aria}
        aria-describedby={erreur ? idErreur : undefined}
        className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl border border-line px-4 text-sm text-mist transition hover:border-danger hover:text-danger-text disabled:opacity-60"
      >
        {labels.remove}
      </button>
      {erreur && (
        <p role="alert" id={idErreur} className="flex flex-wrap items-center gap-x-2 text-sm text-danger-text">
          <span>{erreur}</span>
          <button
            type="button"
            onClick={retirer}
            disabled={envoi}
            className="inline-flex min-h-11 items-center font-semibold text-cloud underline underline-offset-2 disabled:opacity-60"
          >
            {labels.retry}
          </button>
        </p>
      )}
    </div>
  );
}
