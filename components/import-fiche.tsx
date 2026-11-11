"use client";

import { useState } from "react";
import { MessageErreur } from "@/components/message-erreur";

export type ImportFicheLabels = {
  title: string;
  hint: string;
  rights: string;
  url: string;
  cta: string;
  loading: string;
  /** Contient `{host}` : le site d'où le texte a été repris. */
  done: string;
  errorNetwork: string;
};

/** `prixHtg` : seulement pour une fiche préparée par un assistant (lot 3b). Un import par lien ne reprend JAMAIS de prix. */
export type FicheRecue = { titre: string; description: string; marque: string | null; prixHtg?: number | null };

/**
 * IMPORTER UNE FICHE PAR LIEN (lot 2, 2026-11-11) — le vendeur colle le lien
 * d'une fiche qu'il a déjà ailleurs ; le titre et la description reviennent
 * dans le formulaire, où il les relit avant d'envoyer.
 *
 * Ce composant ne décide de rien : il appelle `/api/products/import`, qui ne
 * fait que LIRE une page publique, puis remet le texte au formulaire parent
 * par `onImporte`. C'est le formulaire qui demande confirmation avant
 * d'écraser une saisie, et qui envoie la fiche à la revue comme les autres.
 * Ni photo ni prix ne passent par ici (`lib/import-fiche.ts`).
 *
 * Bouton SECONDAIRE : l'action principale du formulaire reste l'envoi de la fiche.
 */
export function ImportFiche({ labels, disabled = false, onImporte }: {
  labels: ImportFicheLabels;
  disabled?: boolean;
  onImporte: (fiche: FicheRecue) => boolean;
}) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fait, setFait] = useState<string | null>(null);

  async function importer() {
    if (busy || disabled || !url.trim()) return;
    setBusy(true); setError(null); setFait(null);
    try {
      const res = await fetch("/api/products/import", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: url.trim() }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string; titre?: string; description?: string; marque?: string | null; hote?: string } | null;
      if (!res.ok || !data || typeof data.titre !== "string") {
        setError(data?.error ?? labels.errorNetwork);
        return;
      }
      const applique = onImporte({ titre: data.titre, description: typeof data.description === "string" ? data.description : "", marque: data.marque ?? null });
      if (applique) setFait(labels.done.replace("{host}", data.hote ?? ""));
    } catch {
      setError(labels.errorNetwork);
    } finally {
      setBusy(false);
    }
  }

  return (
    <fieldset data-import-fiche className="rounded-xl border border-line p-4">
      <legend className="px-1 text-sm font-semibold">{labels.title}</legend>
      <p className="text-sm leading-relaxed text-mist">{labels.hint}</p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="block min-w-0 flex-1">
          <span className="libelle">{labels.url}</span>
          <input
            className="champ"
            type="url"
            inputMode="url"
            autoComplete="off"
            placeholder="https://"
            value={url}
            maxLength={500}
            disabled={disabled || busy}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void importer(); } }}
          />
        </label>
        <button type="button" className="bouton bouton-secondaire shrink-0" disabled={disabled || busy || !url.trim()} aria-busy={busy} onClick={() => void importer()}>
          {busy ? labels.loading : labels.cta}
        </button>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-mist">{labels.rights}</p>
      {error && <MessageErreur className="mt-2">{error}</MessageErreur>}
      {fait && <p role="status" className="mt-2 text-sm text-success-text">{fait}</p>}
    </fieldset>
  );
}
