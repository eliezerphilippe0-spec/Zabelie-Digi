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
  /** Placeholder du champ « faits réels » (matière, tailles, état…). */
  kwPh: string;
  /** Affiché sur 429 : la limite du jour, pas une panne. */
  limit: string;
  /** Consentement surplus (402) — contient « {prix} », remplacé au rendu. */
  surplus: string;
  /** Libellé du bouton de consentement — contient « {prix} ». */
  surplusGo: string;
  /**
   * Tarif affiché D'EMBLÉE sous le bouton (décision porteur 2026-08-15 :
   * « le vendeur doit savoir que chaque utilisation supplémentaire coûte
   * 5 gourdes »). Composé au SERVEUR depuis la config en base — quota et
   * prix déjà substitués. Absent tant que 0071 n'est pas appliquée : on
   * n'annonce pas un tarif qui n'existe pas.
   */
  tarif?: string;
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
  // 429 ≠ panne : la limite du jour se DIT, sinon elle se lit comme un bug.
  const [limited, setLimited] = useState(false);
  // 402 = quota gratuit épuisé, surplus payant proposé : le prix (HTG) vient
  // de la réponse serveur — jamais codé ici. Non-null ⇒ le consentement
  // s'affiche ; le clic sur « Continuer » renvoie la demande avec surplusOk.
  const [surplusPrix, setSurplusPrix] = useState<number | null>(null);
  const [suggested, setSuggested] = useState(false);
  // Les faits réels du vendeur — la seule source de DÉTAILS de la
  // suggestion : la consigne serveur interdit d'inventer, donc tout ce qui
  // doit figurer de précis (matière, tailles, état…) se donne ici.
  const [keywords, setKeywords] = useState("");

  if (!actif) return null;

  const pret = title.trim().length >= 2;

  async function demander(surplusOk = false) {
    setBusy(true);
    setError(false);
    setLimited(false);
    if (!surplusOk) setSurplusPrix(null);
    try {
      const res = await fetch("/api/ai/description", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          category,
          keywords: keywords.trim() || undefined,
          // Le consentement est explicite : absent par défaut, posé
          // uniquement par le bouton qui AFFICHE le prix.
          surplusOk: surplusOk || undefined,
        }),
      });
      const data = await res.json();
      if (res.status === 402 && typeof data.prixHtg === "number") {
        setSurplusPrix(data.prixHtg);
        return;
      }
      if (res.status === 429) {
        setLimited(true);
        return;
      }
      if (!res.ok || typeof data.description !== "string") {
        setError(true);
        return;
      }
      onSuggestion(data.description);
      setSuggested(true);
      setSurplusPrix(null);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-1.5">
      <input
        className="w-full rounded-lg border border-line bg-ink/40 px-3 py-2 text-xs outline-none focus:border-accent"
        placeholder={labels.kwPh}
        aria-label={labels.kwPh}
        maxLength={300}
        value={keywords}
        onChange={(e) => setKeywords(e.target.value)}
      />
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => demander()}
          disabled={busy || !pret}
          className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-cloud transition hover:border-accent disabled:opacity-50"
        >
          {busy ? labels.loading : labels.button}
        </button>
        {!pret && <span className="text-xs text-mist">{labels.needTitle}</span>}
      </div>
      {labels.tarif && <p className="text-xs text-mist">{labels.tarif}</p>}
      {surplusPrix !== null && (
        <div className="space-y-1.5 rounded-lg border border-line/60 p-3">
          <p className="text-xs text-mist">
            {labels.surplus.replace("{prix}", String(surplusPrix))}
          </p>
          <button
            type="button"
            onClick={() => demander(true)}
            disabled={busy}
            className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-on-brand transition hover:opacity-90 disabled:opacity-50"
          >
            {busy
              ? labels.loading
              : labels.surplusGo.replace("{prix}", String(surplusPrix))}
          </button>
        </div>
      )}
      {limited && <p className="text-xs text-mist">{labels.limit}</p>}
      {error && !limited && <p className="text-xs text-danger-text">{labels.error}</p>}
      {suggested && !error && !limited && (
        <p className="text-xs text-mist">{labels.hint}</p>
      )}
    </div>
  );
}
