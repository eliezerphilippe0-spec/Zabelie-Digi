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
            className="bouton bouton-secondaire bouton-compact"
          >
            {labels.stop}
          </button>
        </div>
      ) : (
        <>
          <p className="mt-1 text-xs text-mist">{labels.hint}</p>
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <label className="block">
              <span className="libelle">{labels.pricePh}</span>
              <input
                inputMode="numeric"
                value={prix}
                onChange={(e) => setPrix(e.target.value.replace(/[^0-9]/g, ""))}
                className="champ w-32"
              />
            </label>
            <label className="block">
              <span className="libelle">{labels.hoursPh}</span>
              <input
                inputMode="numeric"
                value={heures}
                onChange={(e) => setHeures(e.target.value.replace(/[^0-9]/g, ""))}
                className="champ w-28"
              />
            </label>
            <label className="block">
              <span className="libelle">{labels.unitsPh}</span>
              <input
                inputMode="numeric"
                value={unites}
                onChange={(e) => setUnites(e.target.value.replace(/[^0-9]/g, ""))}
                className="champ w-36"
              />
            </label>
            <button
              onClick={lancer}
              disabled={busy || !prix || !heures || Number(prix) >= prixHtg}
              className="bouton bouton-primaire bouton-compact"
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
