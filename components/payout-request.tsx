"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type PayoutRequestLabels = {
  title: string;
  intro: string;
  amount: string;
  submit: string;
  submitting: string;
  cancel: string;
  open: string;
  pending: string;
  networkError: string;
  success: string;
};

/**
 * Demande de retrait par le vendeur (chantier 0, lot 0.b).
 * Tous les contrôles sont en base : ce formulaire n'envoie qu'un montant.
 * Les libellés arrivent en props (règle i18n : jamais de dictionnaire dans un
 * composant client, cf. lib/i18n.ts).
 */
export function PayoutRequest({
  disponibleHtg,
  hasPending,
  labels,
}: {
  disponibleHtg: number;
  hasPending: boolean;
  labels: PayoutRequestLabels;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  if (hasPending) {
    return (
      <p className="rounded-xl border border-line bg-surface/60 px-4 py-3 text-sm text-cloud">
        {labels.pending}
      </p>
    );
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        disabled={disponibleHtg <= 0}
        className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-ink disabled:opacity-50"
      >
        {labels.open}
      </button>
    );
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const amount = Number(new FormData(e.currentTarget).get("amount"));
    try {
      const res = await fetch("/api/payouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountHtg: amount }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg({ ok: false, text: data.error ?? "—" });
      } else {
        setMsg({ ok: true, text: labels.success });
        router.refresh();
      }
    } catch {
      setMsg({ ok: false, text: labels.networkError });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl border border-line bg-surface/60 p-4">
      <p className="font-semibold">{labels.title}</p>
      <p className="text-sm text-cloud">{labels.intro}</p>
      <label className="block text-sm">
        {labels.amount}
        <input
          name="amount"
          type="number"
          min={1}
          max={disponibleHtg}
          step={1}
          required
          className="mt-1 w-full rounded-lg border border-line bg-ink px-3 py-2"
        />
      </label>
      {msg && (
        <p className={`text-sm ${msg.ok ? "text-success-text" : "text-danger-text"}`}>
          {msg.text}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-ink disabled:opacity-60"
        >
          {busy ? labels.submitting : labels.submit}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg border border-line px-4 py-2 text-sm"
        >
          {labels.cancel}
        </button>
      </div>
    </form>
  );
}
