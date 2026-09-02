"use client";

import { useState } from "react";
import { formatHTG } from "@/lib/sample-data";

export type RabaisLabels = {
  title: string;
  newPh: string;
  apply: string;
  remove: string;
  /** La règle d'honnêteté, dite au vendeur : le barré = son prix actuel. */
  hint: string;
  error: string;
};

/**
 * Rabais du vendeur (V-4, docs/35) — dans « Mes produits ». Le vendeur ne
 * saisit que le NOUVEAU prix (inférieur) : l'ancien prix barré est posé par
 * la base (RPC 0075) à partir du prix réellement pratiqué. Les refus de la
 * route (pas une baisse, variantes multiples, 0075 absente) s'affichent
 * tels quels — ils portent le détail.
 */
export function RabaisManager({
  productId,
  prixHtg,
  compareHtg,
  labels,
}: {
  productId: string;
  prixHtg: number;
  compareHtg: number | null;
  labels: RabaisLabels;
}) {
  const [prix, setPrix] = useState(prixHtg);
  const [compare, setCompare] = useState<number | null>(compareHtg);
  const [nouveau, setNouveau] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function poser() {
    const v = Number(nouveau);
    if (!Number.isInteger(v) || v <= 0) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/products/discount", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, newPriceHTG: v }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : labels.error);
        return;
      }
      setCompare(data.ancienHtg);
      setPrix(data.nouveauHtg);
      setNouveau("");
    } catch {
      setError(labels.error);
    } finally {
      setBusy(false);
    }
  }

  async function retirer() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/products/discount", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId }),
      });
      if (!res.ok) {
        setError(labels.error);
        return;
      }
      setCompare(null);
    } catch {
      setError(labels.error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="mt-2 rounded-xl border border-line/60 p-3">
      <summary className="cursor-pointer text-xs font-semibold text-cloud">
        {labels.title} — {compare && <s className="text-mist">{formatHTG(compare)}</s>}{" "}
        {formatHTG(prix)}
      </summary>
      <div className="mt-2 space-y-2">
        <p className="text-xs text-mist">{labels.hint}</p>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={1}
            placeholder={labels.newPh}
            aria-label={labels.newPh}
            value={nouveau}
            onChange={(e) => setNouveau(e.target.value)}
            className="w-36 rounded-lg border border-line bg-ink px-3 py-1.5 text-xs"
          />
          <button
            type="button"
            disabled={busy || !nouveau.trim()}
            onClick={poser}
            className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-cloud hover:border-accent disabled:opacity-50"
          >
            {labels.apply}
          </button>
          {compare !== null && (
            <button
              type="button"
              disabled={busy}
              onClick={retirer}
              className="text-xs text-mist underline hover:text-danger-text disabled:opacity-50"
            >
              {labels.remove}
            </button>
          )}
        </div>
        {error && <p className="text-xs text-danger-text">{error}</p>}
      </div>
    </details>
  );
}
