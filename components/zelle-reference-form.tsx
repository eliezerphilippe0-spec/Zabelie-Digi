"use client";

import { useState } from "react";

/**
 * « J'ai envoyé le paiement » — l'acheteur signale son virement Zelle et peut
 * joindre la référence de confirmation de sa banque. Purement déclaratif :
 * la validation reste administrative (relevé bancaire → confirm_payment).
 */
export function ZelleReferenceForm({
  orderId,
  alreadySent,
  labels,
}: {
  orderId: string;
  alreadySent: boolean;
  labels: { intro: string; placeholder: string; submit: string; done: string };
}) {
  const [reference, setReference] = useState("");
  const [sent, setSent] = useState(alreadySent);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (sent) {
    return (
      <p className="rounded-2xl border border-line bg-surface/60 p-4 text-sm text-cloud">
        ✓ {labels.done}
      </p>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/zelle/reference", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, reference: reference.trim() || null }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Une erreur est survenue.");
        return;
      }
      setSent(true);
    } catch {
      setError("Connexion impossible. Réessayez.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <p className="text-sm font-semibold">{labels.intro}</p>
      <input
        value={reference}
        onChange={(e) => setReference(e.target.value)}
        placeholder={labels.placeholder}
        maxLength={64}
        className="mt-2 w-full rounded-xl border border-line bg-surface/60 px-4 py-2.5 text-sm text-cloud placeholder:text-mist focus:border-brand/60 focus:outline-none"
      />
      <button
        type="submit"
        disabled={loading}
        className="mt-3 w-full rounded-xl bg-brand px-6 py-3 text-sm font-semibold text-ink transition hover:opacity-90 disabled:opacity-60"
      >
        {labels.submit}
      </button>
      {error && <p className="mt-2 text-center text-xs text-danger-text">{error}</p>}
    </form>
  );
}
