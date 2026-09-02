"use client";

import { useState } from "react";
import type { KycStatut, KycType } from "@/lib/kyc";

export type KycLabels = {
  title: string;
  /** Ce que la vérification garde — dit avant qu'on demande une pièce. */
  why: string;
  pending: string;
  approved: string;
  rejected: string;
  cin: string;
  paspo: string;
  selfie: string;
  add: string;
  sending: string;
  error: string;
  deposited: string;
};

/**
 * Dépôt des pièces d'identité (docs/35 V-6).
 *
 * Ce composant ne montre JAMAIS d'image : le bucket est privé et aucune URL
 * publique n'existe. Il affiche ce qui a été déposé — le type, pas la pièce —
 * et l'état du dossier.
 *
 * Le `why` est affiché AVANT le premier dépôt : demander une pièce d'identité
 * sans dire ce qu'elle garde, c'est demander une faveur.
 */
export function KycForm({
  statut,
  deposes,
  noteAdmin,
  labels,
}: {
  statut: KycStatut;
  deposes: { id: string; kind: KycType }[];
  noteAdmin: string | null;
  labels: KycLabels;
}) {
  const [pieces, setPieces] = useState(deposes);
  const [busy, setBusy] = useState<KycType | null>(null);
  const [error, setError] = useState<string | null>(null);

  const libelle: Record<KycType, string> = {
    cin: labels.cin,
    paspo: labels.paspo,
    selfie: labels.selfie,
  };

  async function deposer(kind: KycType, file: File | null) {
    if (!file) return;
    setBusy(kind);
    setError(null);
    try {
      const form = new FormData();
      form.set("kind", kind);
      form.set("file", file);
      const res = await fetch("/api/kyc", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok || !data.id) {
        setError(typeof data.error === "string" ? data.error : labels.error);
        return;
      }
      setPieces((p) => [...p, { id: data.id, kind }]);
    } catch {
      setError(labels.error);
    } finally {
      setBusy(null);
    }
  }

  const etat =
    statut === "approved"
      ? labels.approved
      : statut === "rejected"
        ? labels.rejected
        : labels.pending;

  return (
    <div className="mt-8 space-y-3 rounded-2xl border border-line bg-surface/40 p-5">
      <h2 className="text-sm font-semibold text-cloud">{labels.title}</h2>
      <p className="text-xs text-mist">{labels.why}</p>
      <p
        className={
          statut === "approved"
            ? "text-xs font-semibold text-brand"
            : statut === "rejected"
              ? "text-xs font-semibold text-danger-text"
              : "text-xs text-mist"
        }
      >
        {etat}
      </p>
      {statut === "rejected" && noteAdmin && (
        <p className="text-xs text-mist">{noteAdmin}</p>
      )}

      {pieces.length > 0 && (
        <ul className="text-xs text-mist">
          {pieces.map((p) => (
            <li key={p.id}>
              {libelle[p.kind]} — {labels.deposited}
            </li>
          ))}
        </ul>
      )}

      {statut !== "approved" && (
        <div className="flex flex-wrap gap-2">
          {(["cin", "paspo", "selfie"] as KycType[]).map((k) => (
            <label
              key={k}
              className="cursor-pointer rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-cloud hover:border-accent"
            >
              {busy === k ? labels.sending : `${labels.add} — ${libelle[k]}`}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                className="hidden"
                disabled={busy !== null}
                onChange={(e) => {
                  deposer(k, e.target.files?.[0] ?? null);
                  e.target.value = "";
                }}
              />
            </label>
          ))}
        </div>
      )}
      {error && <p className="text-xs text-danger-text">{error}</p>}
    </div>
  );
}
