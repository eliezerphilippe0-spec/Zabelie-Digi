"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Annule l'écriture comptable via POST /api/admin/refund (RPC refund_order :
 * idempotente, annule l'escrow — aucun solde fantôme). Admin uniquement.
 */
export function AdminRefundButton({ orderId, labels }: {
  orderId: string;
  labels: { button: string; confirm: string; error: string; connection: string; notice: string; operations: string };
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refund() {
    if (
      !window.confirm(
        labels.confirm
      )
    ) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/refund", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? labels.error);
        return;
      }
      router.refresh();
    } catch {
      setError(labels.connection);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="text-right">
      <button
        onClick={refund}
        disabled={loading}
        className="inline-flex min-h-11 items-center rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-danger-text transition hover:border-danger/50 disabled:opacity-60"
      >
        {loading ? "…" : labels.button}
      </button>
      <p className="mt-1 max-w-sm text-xs text-mist">{labels.notice} <a href="/admin/operations" className="underline">{labels.operations}</a></p>
      {error && <p className="mt-1 text-xs text-danger-text">{error}</p>}
    </div>
  );
}
