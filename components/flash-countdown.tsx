"use client";

import { useSyncExternalStore } from "react";

// L'horloge change uniquement lors d'une notification. Lire Date.now() dans
// getSnapshot donnerait une nouvelle valeur à chaque lecture de React.
let maintenant: number | null = null;
let intervalle: ReturnType<typeof setInterval> | undefined;
const auditeurs = new Set<() => void>();
const lireHorloge = () => maintenant;
const horlogeServeur = () => null;
function abonnerHorloge(auditeur: () => void) {
  auditeurs.add(auditeur);
  if (intervalle === undefined) {
    maintenant = Date.now();
    intervalle = setInterval(() => {
      maintenant = Date.now();
      auditeurs.forEach(notifier => notifier());
    }, 1000);
  }
  auditeur();
  return () => {
    auditeurs.delete(auditeur);
    if (auditeurs.size === 0 && intervalle !== undefined) {
      clearInterval(intervalle);
      intervalle = undefined;
      maintenant = null;
    }
  };
}

/**
 * Compte à rebours d'une offre flash (fiche produit). Purement décoratif :
 * la fenêtre qui FAIT FOI est relue par le serveur au checkout — un onglet
 * resté ouvert au-delà de la fin verra le refus explicite du serveur, jamais
 * un prix flash fantôme.
 */
export function FlashCountdown({ fin, prefix }: { fin: string; prefix: string }) {
  // Serveur et première hydratation rendent la même chose, même si le HTML
  // arrive plusieurs secondes plus tard ou si l'horloge du téléphone diffère.
  const horloge = useSyncExternalStore(abonnerHorloge, lireHorloge, horlogeServeur);
  if (horloge === null) return null;
  const reste = Date.parse(fin) - horloge;

  if (reste <= 0) return null;
  const h = Math.floor(reste / 3600_000);
  const m = Math.floor((reste % 3600_000) / 60_000);
  const s = Math.floor((reste % 60_000) / 1000);
  const deux = (n: number) => String(n).padStart(2, "0");

  return (
    <span className="numeric text-xs font-bold text-accent">
      {prefix} {h > 0 ? `${h}:${deux(m)}:${deux(s)}` : `${m}:${deux(s)}`}
    </span>
  );
}
