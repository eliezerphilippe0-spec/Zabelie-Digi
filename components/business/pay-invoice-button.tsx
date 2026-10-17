"use client";

import { useState } from "react";
import type { PayInvoiceLabels } from "@/lib/facturation-copy";

/**
 * Bouton « Payer avec MonCash » du portail client. POST vers la route de
 * paiement (montant calculé serveur), puis redirection vers la passerelle.
 */
export function PayInvoiceButton({ token, labels }: { token: string; labels: PayInvoiceLabels }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pay() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/facture/${token}/pay`, { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.redirectUrl) {
        setError(data.error ?? labels.payUnavailable);
        return;
      }
      window.location.href = data.redirectUrl;
    } catch {
      setError(labels.network);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        onClick={pay}
        disabled={loading}
        className="w-full rounded-xl bg-brand px-5 py-3 text-center text-sm font-semibold text-on-brand transition hover:opacity-90 disabled:opacity-60"
      >
        {loading ? labels.redirecting : labels.payCta}
      </button>
      {error && <p className="mt-2 text-sm text-danger-text">{error}</p>}
    </div>
  );
}
