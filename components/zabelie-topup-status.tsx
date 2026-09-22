"use client";

import { useState } from "react";
import { usePoll } from "@/lib/use-poll";

/**
 * Statut temps réel d'une recharge — polling léger (JSON minuscule, toutes
 * les 5 s, 3G-friendly), arrêt sur état terminal. La vérité vient du serveur.
 */
export function ZabelieTopupStatus({
  orderId,
  initialStatus,
  labels,
}: {
  orderId: string;
  initialStatus: string;
  labels: Record<string, string>;
}) {
  const [status, setStatus] = useState(initialStatus);
  const terminal = ["delivered", "refunded"];

  // 5 s × 120 ticks ≈ 10 min par segment de statut (resetKey relance le
  // budget à chaque transition, comme avant l'extraction du hook).
  usePoll({
    enabled: !terminal.includes(status),
    intervalMs: 5000,
    maxTicks: 120,
    resetKey: `${orderId}:${status}`,
    onTick: async (signal) => {
      const res = await fetch(`/api/zabelie/topup/orders/${orderId}`, {
        cache: "no-store",
        signal,
      });
      if (!res.ok) return false;
      const data = await res.json();
      if (signal.aborted) return false;
      if (data.status && data.status !== status) setStatus(data.status);
      return terminal.includes(data.status);
    },
  });

  const tone =
    status === "delivered"
      ? "border-success/50 text-success-text"
      : status === "failed" || status === "refund_pending"
        ? "border-danger/50 text-danger-text"
        : status === "refunded"
          ? "border-warning/50 text-warning-text"
          : "border-line text-cloud";

  return (
    <div className={`rounded-2xl border bg-surface/60 p-5 text-sm ${tone}`}>
      <p className="font-semibold">
        {labels[status] ?? status}
        {!["delivered", "refunded", "failed", "refund_pending"].includes(status) && (
          <span className="ml-2 inline-block animate-pulse">●</span>
        )}
      </p>
    </div>
  );
}
