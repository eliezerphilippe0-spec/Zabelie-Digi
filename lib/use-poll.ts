"use client";

import { useEffect, useRef } from "react";

/**
 * Polling léger partagé (3G-friendly) : intervalle fixe, budget de ticks
 * (data chère), arrêt sur signal du callback, nettoyage à l'unmount, erreurs
 * réseau avalées (on retente au tick suivant). Source unique des propriétés
 * de sûreté pour les DEUX suivis de statut du site (order-status-poll,
 * zabelie-topup-status) — auparavant chacun ré-implémentait sa boucle.
 */
export function usePoll({
  enabled = true,
  intervalMs,
  maxTicks,
  resetKey,
  onTick,
}: {
  enabled?: boolean;
  intervalMs: number;
  /** Budget total de ticks — l'intervalle s'arrête silencieusement au-delà. */
  maxTicks: number;
  /** Changement de valeur → compteur remis à zéro, intervalle relancé. */
  resetKey?: unknown;
  /** Renvoyer true pour arrêter le polling (état terminal atteint). */
  onTick: () => Promise<boolean>;
}) {
  // Ref : le callback peut capturer un state frais à chaque rendu sans
  // redémarrer l'intervalle (qui ne dépend que du cadencement).
  const tickRef = useRef(onTick);
  tickRef.current = onTick;

  useEffect(() => {
    if (!enabled) return;
    let ticks = 0;
    const timer = setInterval(async () => {
      ticks += 1;
      if (ticks > maxTicks) return clearInterval(timer);
      try {
        if (await tickRef.current()) clearInterval(timer);
      } catch {
        /* réseau instable : on retentera au tick suivant */
      }
    }, intervalMs);
    return () => clearInterval(timer);
     
  }, [enabled, intervalMs, maxTicks, resetKey]);
}
