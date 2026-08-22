"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Rembourse une commande via POST /api/admin/refund (RPC refund_order :
 * idempotente, annule l'escrow — aucun solde fantôme). Admin uniquement.
 */
export function AdminRefundButton({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refund() {
    if (
      !window.confirm(
        "Rembourser cette commande ? L'escrow du vendeur sera annulé (avant maturité) ou son solde débité (après)."
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
        setError(data.error ?? "Échec du remboursement.");
        return;
      }
      router.refresh();
    } catch {
      setError("Connexion impossible.");
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
        {loading ? "…" : "Rembourser"}
      </button>
      {error && <p className="mt-1 text-xs text-danger-text">{error}</p>}
    </div>
  );
}
