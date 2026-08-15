"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type PayoutRequestRow = {
  id: string;
  amount_htg: number;
  created_at: string;
  display_name: string | null;
};

/**
 * File des demandes de retrait en attente (chantier 0, lot 0.b — côté admin).
 * « Régler » n'effectue aucun mouvement d'argent : le solde a été débité à la
 * demande. On inscrit la PREUVE du virement. « Rejeter » restitue le solde par
 * écriture compensatoire en base.
 */
export function PayoutQueue({ rows }: { rows: PayoutRequestRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ id: string; ok: boolean; text: string } | null>(null);

  async function act(id: string, action: "paid" | "rejected", form: HTMLFormElement) {
    const fd = new FormData(form);
    setBusy(id);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/payouts/settle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payoutId: id,
          action,
          method: fd.get("method"),
          reference: fd.get("reference"),
          reason: fd.get("reason"),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg({ id, ok: false, text: data.error ?? "Échec" });
      } else {
        setMsg({ id, ok: true, text: action === "paid" ? "Réglé." : "Rejeté, solde restitué." });
        router.refresh();
      }
    } catch {
      setMsg({ id, ok: false, text: "Erreur réseau." });
    } finally {
      setBusy(null);
    }
  }

  if (rows.length === 0) return null;

  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold">
        Demandes de retrait en attente ({rows.length})
      </h2>
      <p className="mt-1 text-sm text-mist">
        Le montant est déjà réservé sur le solde du vendeur. Virez par MonCash,
        puis inscrivez la référence du reçu.
      </p>
      <ul className="mt-4 space-y-4">
        {rows.map((r) => (
          <li key={r.id} className="rounded-2xl border border-brand/40 bg-surface/60 p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-bold">{r.display_name ?? "Vendeur"}</p>
              <p className="metric text-xl font-extrabold">{r.amount_htg} HTG</p>
            </div>
            <p className="mt-1 text-xs text-mist">
              Demandé le {new Date(r.created_at).toLocaleDateString("fr-HT")}
            </p>
            <form
              className="mt-3 space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                act(r.id, "paid", e.currentTarget);
              }}
            >
              <div className="grid gap-2 sm:grid-cols-3">
                <select
                  name="method"
                  defaultValue="moncash"
                  className="rounded-lg border border-line bg-ink px-3 py-2 text-sm"
                >
                  <option value="moncash">MonCash</option>
                  <option value="especes">Espèces</option>
                  <option value="virement">Virement</option>
                  <option value="autre">Autre</option>
                </select>
                <input
                  name="reference"
                  placeholder="Référence du reçu"
                  className="rounded-lg border border-line bg-ink px-3 py-2 text-sm sm:col-span-2"
                />
              </div>
              <input
                name="reason"
                placeholder="Motif (si rejet)"
                className="w-full rounded-lg border border-line bg-ink px-3 py-2 text-sm"
              />
              {msg?.id === r.id && (
                <p className={`text-sm ${msg.ok ? "text-success-text" : "text-danger-text"}`}>
                  {msg.text}
                </p>
              )}
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={busy === r.id}
                  className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-on-brand disabled:opacity-60"
                >
                  {busy === r.id ? "…" : "Marquer réglé"}
                </button>
                <button
                  type="button"
                  disabled={busy === r.id}
                  onClick={(e) =>
                    act(r.id, "rejected", e.currentTarget.closest("form") as HTMLFormElement)
                  }
                  className="rounded-lg border border-danger/50 px-4 py-2 text-sm text-danger-text"
                >
                  Rejeter
                </button>
              </div>
            </form>
          </li>
        ))}
      </ul>
    </section>
  );
}
