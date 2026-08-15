"use client";

import { useState } from "react";
import { formatHTG } from "@/lib/sample-data";

export type FlashLabels = {
  title: string;
  pricePh: string;
  hoursPh: string;
  unitsPh: string;
  launch: string;
  stop: string;
  active: string;
  hint: string;
  error: string;
};

/**
 * Vente flash du vendeur (docs/37 §B) — dans « Mes produits », à côté du
 * rabais. Les bornes (durée max, rabais min/max, plafond d'offres) vivent en
 * base (ZB080) : un refus arrive avec sa raison exacte, on l'affiche telle
 * quelle plutôt que de la paraphraser.
 */
export function FlashManager({
  productId,
  prixHtg,
  offre,
  labels,
}: {
  productId: string;
  prixHtg: number;
  /** L'offre vivante au rendu serveur, s'il y en a une. */
  offre: { fin: string; prixFlashHtg: number } | null;
  labels: FlashLabels;
}) {
  const [vivante, setVivante] = useState(offre);
  const [prix, setPrix] = useState("");
  const [heures, setHeures] = useState("");
  const [unites, setUnites] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function lancer() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/products/flash", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId,
          prixFlashHTG: Number(prix),
          dureeH: Number(heures),
          unitesMax: unites ? Number(unites) : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : labels.error);
        return;
      }
      setVivante({ fin: data.fin, prixFlashHtg: Number(prix) });
      setPrix("");
      setHeures("");
      setUnites("");
    } catch {
      setError(labels.error);
    } finally {
      setBusy(false);
    }
  }

  async function arreter() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/products/flash", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId }),
      });
      if (res.ok) setVivante(null);
      else {
        const data = await res.json();
        setError(typeof data.error === "string" ? data.error : labels.error);
      }
    } catch {
      setError(labels.error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2 rounded-xl border border-line p-3">
      <p className="text-xs font-semibold text-cloud">{labels.title}</p>
      {vivante ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-mist">
          <span className="rounded-full border border-brand px-2 py-0.5 font-bold text-brand">
            {formatHTG(vivante.prixFlashHtg)}
          </span>
          <span>
            {labels.active} {new Date(vivante.fin).toLocaleString()}
          </span>
          <button
            onClick={arreter}
            disabled={busy}
            className="inline-flex min-h-11 items-center rounded-lg border border-line px-3 text-xs text-cloud transition hover:border-danger-text disabled:opacity-60"
          >
            {labels.stop}
          </button>
        </div>
      ) : (
        <>
          <p className="mt-1 text-xs text-mist">{labels.hint}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              inputMode="numeric"
              value={prix}
              onChange={(e) => setPrix(e.target.value.replace(/[^0-9]/g, ""))}
              placeholder={labels.pricePh}
              className="w-32 rounded-lg border border-line bg-transparent px-2 py-2 text-xs text-cloud"
            />
            <input
              inputMode="numeric"
              value={heures}
              onChange={(e) => setHeures(e.target.value.replace(/[^0-9]/g, ""))}
              placeholder={labels.hoursPh}
              className="w-28 rounded-lg border border-line bg-transparent px-2 py-2 text-xs text-cloud"
            />
            <input
              inputMode="numeric"
              value={unites}
              onChange={(e) => setUnites(e.target.value.replace(/[^0-9]/g, ""))}
              placeholder={labels.unitsPh}
              className="w-36 rounded-lg border border-line bg-transparent px-2 py-2 text-xs text-cloud"
            />
            <button
              onClick={lancer}
              disabled={busy || !prix || !heures || Number(prix) >= prixHtg}
              className="inline-flex min-h-11 items-center rounded-lg bg-brand px-3 text-xs font-semibold text-on-brand transition hover:opacity-90 disabled:opacity-60"
            >
              {labels.launch}
            </button>
          </div>
        </>
      )}
      {error && <p className="mt-1 text-xs text-danger-text">{error}</p>}
    </div>
  );
}
