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
  onTick: (signal: AbortSignal) => Promise<boolean>;
}) {
  // Ref : le callback peut capturer un state frais à chaque rendu sans
  // redémarrer l'intervalle (qui ne dépend que du cadencement).
  const tickRef = useRef(onTick);
  useEffect(() => { tickRef.current = onTick; }, [onTick]);

  useEffect(() => {
    if (!enabled) return;
    let ticks = 0;
    let stopped = false;
    let inFlight = false;
    let pending: AbortController | null = null;
    const tick = async () => {
      if (stopped || inFlight || !navigator.onLine || document.visibilityState === "hidden") return;
      if (++ticks > maxTicks) { stopped = true; clearInterval(timer); return; }
      inFlight = true;
      pending = new AbortController();
      const timeout = setTimeout(() => pending?.abort(), intervalMs);
      try { if (await tickRef.current(pending.signal)) { stopped = true; clearInterval(timer); } }
      catch { /* Retry after transient network failure. */ }
      finally { clearTimeout(timeout); pending = null; inFlight = false; }
    };
    const timer = setInterval(tick, intervalMs);
    const resume = () => { void tick(); };
    window.addEventListener("online", resume);
    document.addEventListener("visibilitychange", resume);
    void tick();
    return () => { stopped = true; pending?.abort(); clearInterval(timer); window.removeEventListener("online", resume); document.removeEventListener("visibilitychange", resume); };
     
  }, [enabled, intervalMs, maxTicks, resetKey]);
}
