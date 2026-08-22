"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Confirme un virement Zelle via POST /api/admin/confirm-zelle (RPC
 * confirm_payment : idempotente, garde-fou USD en base). À n'utiliser
 * qu'après vérification du relevé bancaire — montant EXACT reçu.
 */
export function AdminZelleConfirmButton({
  orderId,
  amountUsd,
}: {
  orderId: string;
  amountUsd: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    const reference = window.prompt(
      `Confirmer la réception de ${amountUsd} par Zelle ?\n\n` +
        "⚠️ Vérifiez le relevé bancaire : le montant reçu doit être EXACT " +
        "(sinon remboursez côté banque).\n\n" +
        "Référence du virement (optionnel) :"
    );
    if (reference === null) return; // annulé
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/confirm-zelle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, reference: reference.trim() || null }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Échec de la confirmation.");
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
        onClick={confirm}
        disabled={loading}
        className="inline-flex min-h-11 items-center rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-success-text transition hover:border-success/50 disabled:opacity-60"
      >
        {loading ? "…" : "Confirmer la réception"}
      </button>
      {error && <p className="mt-1 text-xs text-danger-text">{error}</p>}
    </div>
  );
}
