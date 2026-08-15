"use client";

import { useState } from "react";

export type GalerieLabels = {
  title: string;
  add: string;
  sending: string;
  remove: string;
  /** Rappel du plafond — composé au serveur (« Jusqu'à 6 photos… »). */
  hint: string;
  error: string;
};

type MediaItem = { id: string; url: string };

/**
 * Gestionnaire de galerie du vendeur (V-1A, docs/35) — dans la liste
 * « Mes produits ». L'état initial vient du SERVEUR (les médias existants) ;
 * chaque ajout/retrait met la liste à jour depuis la réponse de la route,
 * jamais par re-fetch complet. Libellés en props : composant sous
 * `components/`, le cliquet i18n interdit le texte en dur.
 */
export function GalerieManager({
  productId,
  initial,
  max,
  labels,
}: {
  productId: string;
  initial: MediaItem[];
  max: number;
  labels: GalerieLabels;
}) {
  const [medias, setMedias] = useState<MediaItem[]>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ajouter(file: File | null) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("productId", productId);
      form.set("file", file);
      const res = await fetch("/api/products/media", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok || !data.id) {
        setError(typeof data.error === "string" ? data.error : labels.error);
        return;
      }
      setMedias((m) => [...m, { id: data.id, url: data.url }]);
    } catch {
      setError(labels.error);
    } finally {
      setBusy(false);
    }
  }

  async function retirer(mediaId: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/products/media", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, mediaId }),
      });
      if (!res.ok) {
        setError(labels.error);
        return;
      }
      setMedias((m) => m.filter((x) => x.id !== mediaId));
    } catch {
      setError(labels.error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="mt-2 rounded-xl border border-line/60 p-3">
      <summary className="cursor-pointer text-xs font-semibold text-cloud">
        {labels.title} ({medias.length}/{max})
      </summary>
      <div className="mt-2 space-y-2">
        <p className="text-xs text-mist">{labels.hint}</p>
        {medias.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {medias.map((m) => (
              <div key={m.id} className="space-y-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={m.url}
                  alt=""
                  width={72}
                  height={54}
                  decoding="async"
                  className="aspect-[4/3] w-18 rounded-lg border border-line object-cover"
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => retirer(m.id)}
                  className="block w-full text-center text-xs text-mist underline hover:text-danger-text disabled:opacity-50"
                >
                  {labels.remove}
                </button>
              </div>
            ))}
          </div>
        )}
        {medias.length < max && (
          <label className="inline-block cursor-pointer rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-cloud hover:border-violet">
            {busy ? labels.sending : labels.add}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              disabled={busy}
              onChange={(e) => {
                ajouter(e.target.files?.[0] ?? null);
                e.target.value = "";
              }}
            />
          </label>
        )}
        {error && <p className="text-xs text-danger-text">{error}</p>}
      </div>
    </details>
  );
}
