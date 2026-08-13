"use client";

import { useState } from "react";

/**
 * Le geste de désinstallation, et son compte rendu.
 *
 * ⚠️ IL DIT CE QU'IL A FAIT, PAS CE QU'IL A TENTÉ. Un bouton qui afficherait
 * « c'est fait » sans compter ce qu'il a réellement retiré serait un succès
 * décoratif — et sur une page de dépannage, un faux succès est le pire cas :
 * le dépanneur repart en croyant le problème résolu.
 *
 * Deux choses sont retirées, et il faut les deux : la désinscription seule
 * laisserait les caches derrière elle, et leurs réponses périmées avec.
 */
export function DesinstallerSW() {
  const [etat, setEtat] = useState<
    | { phase: "repos" }
    | { phase: "en_cours" }
    | { phase: "fait"; workers: number; caches: number }
    | { phase: "impossible"; motif: string }
  >({ phase: "repos" });

  async function desinstaller() {
    setEtat({ phase: "en_cours" });
    try {
      if (!("serviceWorker" in navigator)) {
        setEtat({
          phase: "impossible",
          motif: "Ce navigateur ne gère pas les service workers — il n'y a donc rien à retirer.",
        });
        return;
      }
      const inscrits = await navigator.serviceWorker.getRegistrations();
      let workers = 0;
      for (const r of inscrits) if (await r.unregister()) workers++;

      let effaces = 0;
      if ("caches" in window) {
        const noms = await caches.keys();
        for (const n of noms) if (await caches.delete(n)) effaces++;
      }
      setEtat({ phase: "fait", workers, caches: effaces });
    } catch (e) {
      setEtat({
        phase: "impossible",
        motif: e instanceof Error ? e.message : "erreur inconnue",
      });
    }
  }

  return (
    <div className="mt-8">
      <button
        type="button"
        onClick={desinstaller}
        disabled={etat.phase === "en_cours"}
        className="rounded-xl bg-brand px-5 py-3 text-sm font-bold text-ink disabled:opacity-60"
      >
        {etat.phase === "en_cours" ? "Retrait en cours…" : "Désinstaller maintenant"}
      </button>

      {etat.phase === "fait" && (
        <p className="mt-4 text-sm text-cloud">
          {etat.workers} service worker(s) désinscrit(s), {etat.caches} cache(s)
          supprimé(s).{" "}
          {etat.workers === 0 && etat.caches === 0 ? (
            <>Rien n&apos;était installé sur ce navigateur.</>
          ) : (
            <>Fermez tous les onglets Zabelie, puis rouvrez le site.</>
          )}
        </p>
      )}

      {etat.phase === "impossible" && (
        <p className="mt-4 text-sm text-cloud">
          Le retrait n&apos;a pas abouti : {etat.motif}
        </p>
      )}
    </div>
  );
}
