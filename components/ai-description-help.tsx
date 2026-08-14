"use client";

import { useState } from "react";

export type AiHelpLabels = {
  button: string;
  loading: string;
  error: string;
  /** Rappel affiché avec la suggestion : relire, corriger — le vendeur signe. */
  hint: string;
  /** Affiché quand le bouton attend un titre. */
  needTitle: string;
};

/**
 * Bouton « M'aider à rédiger » sous le champ description des deux formulaires
 * vendeur. Contrat :
 *
 *   - `actif` vient du SERVEUR (`aiProviderDisponible()`) — pas de clé posée,
 *     pas de bouton : le composant ne rend rien du tout ;
 *   - la suggestion REMPLIT le textarea via `onSuggestion`, elle ne publie
 *     rien — le vendeur relit et corrige, le rappel `hint` le lui dit ;
 *   - le titre est la matière première : tant qu'il est vide, le bouton
 *     attend au lieu d'appeler pour rien.
 */
export function AiDescriptionHelp({
  actif,
  title,
  category,
  labels,
  onSuggestion,
}: {
  actif: boolean;
  title: string;
  category?: string;
  labels: AiHelpLabels;
  onSuggestion: (texte: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [suggested, setSuggested] = useState(false);

  if (!actif) return null;

  const pret = title.trim().length >= 2;

  async function demander() {
    setBusy(true);
    setError(false);
    try {
      const res = await fetch("/api/ai/description", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, category }),
      });
      const data = await res.json();
      if (!res.ok || typeof data.description !== "string") {
        setError(true);
        return;
      }
      onSuggestion(data.description);
      setSuggested(true);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={demander}
          disabled={busy || !pret}
          className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-cloud transition hover:border-violet disabled:opacity-50"
        >
          {busy ? labels.loading : labels.button}
        </button>
        {!pret && <span className="text-xs text-mist">{labels.needTitle}</span>}
      </div>
      {error && <p className="text-xs text-danger-text">{labels.error}</p>}
      {suggested && !error && <p className="text-xs text-mist">{labels.hint}</p>}
    </div>
  );
}
