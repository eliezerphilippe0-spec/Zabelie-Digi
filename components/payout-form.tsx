"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Enregistrement d'un règlement vendeur DÉJÀ EFFECTUÉ (chantier 0, lot 0.a).
 * Le formulaire n'envoie aucun montant de référence : le contrôle du solde
 * disponible est fait en base. La référence du reçu est obligatoire — c'est la
 * preuve du règlement ET la clé d'idempotence.
 */
export function PayoutForm({
  walletId,
  displayName,
  disponibleHtg,
}: {
  walletId: string;
  displayName: string;
  disponibleHtg: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const form = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/admin/payouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletId,
          amountHtg: Number(form.get("amount")),
          method: form.get("method"),
          reference: form.get("reference"),
          note: form.get("note"),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg({ ok: false, text: data.error ?? "Échec de l'enregistrement" });
      } else if (data.duplicate) {
        setMsg({ ok: true, text: "Ce reçu était déjà enregistré — aucun double débit." });
      } else {
        setMsg({
          ok: true,
          text: `Enregistré. Nouveau solde disponible : ${data.balanceHtg} HTG.`,
        });
        router.refresh();
      }
    } catch {
      setMsg({ ok: false, text: "Erreur réseau — réessayez." });
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg border border-line px-3 py-1.5 text-sm font-semibold hover:bg-surface"
      >
        Enregistrer un règlement
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="mt-3 space-y-3 rounded-xl border border-line bg-surface/60 p-4">
      <p className="text-sm text-cloud">
        Règlement déjà versé à <strong>{displayName}</strong> — disponible :{" "}
        {disponibleHtg} HTG
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          Montant versé (HTG)
          <input
            name="amount"
            type="number"
            min={1}
            step={1}
            required
            className="mt-1 w-full rounded-lg border border-line bg-ink px-3 py-2"
          />
        </label>
        <label className="text-sm">
          Moyen
          <select
            name="method"
            defaultValue="moncash"
            className="mt-1 w-full rounded-lg border border-line bg-ink px-3 py-2"
          >
            <option value="moncash">MonCash</option>
            <option value="especes">Espèces</option>
            <option value="virement">Virement bancaire</option>
            <option value="autre">Autre</option>
          </select>
        </label>
      </div>
      <label className="block text-sm">
        Référence du reçu <span className="text-danger-text">*</span>
        <input
          name="reference"
          required
          placeholder="N° de transaction MonCash"
          className="mt-1 w-full rounded-lg border border-line bg-ink px-3 py-2"
        />
        <span className="mt-1 block text-xs text-mist">
          Obligatoire : c&apos;est la preuve du règlement et ce qui empêche un
          double enregistrement.
        </span>
      </label>
      <label className="block text-sm">
        Note (facultatif)
        <input
          name="note"
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
          {busy ? "Enregistrement…" : "Enregistrer"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg border border-line px-4 py-2 text-sm"
        >
          Fermer
        </button>
      </div>
    </form>
  );
}
