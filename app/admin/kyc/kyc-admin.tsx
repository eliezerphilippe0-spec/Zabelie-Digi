"use client";

import { useEffect, useState } from "react";

type Piece = { id: string; kind: string; url: string | null };
type Dossier = {
  userId: string;
  nom: string | null;
  soumisLe: string;
  pieces: Piece[];
};

/**
 * Revue KYC (docs/35 V-6) — outil interne, français assumé (même régime que
 * le reste d'`app/admin`, exclu du cliquet i18n).
 *
 * Les images arrivent par URL SIGNÉE à courte durée, jamais publique, et sont
 * rechargées à chaque ouverture de la page : une URL périmée dans un
 * historique de navigateur ne rouvre pas une pièce d'identité.
 */
export function KycAdmin() {
  const [dossiers, setDossiers] = useState<Dossier[]>([]);
  const [etat, setEtat] = useState<"chargement" | "prêt" | "erreur">("chargement");
  const [message, setMessage] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  async function charger() {
    setEtat("chargement");
    try {
      const res = await fetch("/api/admin/kyc");
      const data = await res.json();
      if (!res.ok) {
        setMessage(typeof data.error === "string" ? data.error : "Lecture impossible.");
        setEtat("erreur");
        return;
      }
      setDossiers(data.dossiers ?? []);
      setEtat("prêt");
    } catch {
      setMessage("Réseau indisponible.");
      setEtat("erreur");
    }
  }

  useEffect(() => {
    charger();
  }, []);

  async function decider(userId: string, action: "approve" | "reject") {
    setBusy(userId);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/kyc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, action, note: notes[userId] ?? "" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(typeof data.error === "string" ? data.error : "Décision refusée.");
        return;
      }
      setDossiers((d) => d.filter((x) => x.userId !== userId));
    } catch {
      setMessage("Réseau indisponible.");
    } finally {
      setBusy(null);
    }
  }

  if (etat === "chargement") return <p className="mt-6 text-sm text-mist">Chargement…</p>;

  return (
    <div className="mt-6 space-y-4">
      {message && <p className="text-sm text-danger-text">{message}</p>}
      {dossiers.length === 0 && etat === "prêt" && (
        <p className="text-sm text-mist">Aucun dossier en attente.</p>
      )}
      {dossiers.map((d) => (
        <div key={d.userId} className="rounded-2xl border border-line bg-surface/60 p-5">
          <p className="text-sm font-semibold">{d.nom ?? d.userId}</p>
          <p className="text-xs text-mist">
            Déposé le {new Date(d.soumisLe).toLocaleDateString("fr-HT")} ·{" "}
            {d.pieces.length} pièce(s)
          </p>

          <div className="mt-3 flex flex-wrap gap-3">
            {d.pieces.map((p) => (
              <div key={p.id} className="text-xs">
                <p className="text-mist">{p.kind}</p>
                {p.url ? (
                  <a
                    href={p.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:text-cloud"
                  >
                    Ouvrir la pièce
                  </a>
                ) : (
                  <span className="text-danger-text">Lien indisponible</span>
                )}
              </div>
            ))}
          </div>

          <textarea
            placeholder="Motif (obligatoire pour un refus)"
            value={notes[d.userId] ?? ""}
            onChange={(e) => setNotes((n) => ({ ...n, [d.userId]: e.target.value }))}
            rows={2}
            className="mt-3 w-full rounded-xl border border-line bg-ink px-3 py-2 text-sm"
          />

          <div className="mt-3 flex gap-3">
            <button
              type="button"
              disabled={busy === d.userId}
              onClick={() => decider(d.userId, "approve")}
              className="rounded-xl bg-brand px-4 py-2 text-xs font-semibold text-on-brand disabled:opacity-50"
            >
              Vérifier
            </button>
            <button
              type="button"
              disabled={busy === d.userId}
              onClick={() => decider(d.userId, "reject")}
              className="rounded-xl border border-line px-4 py-2 text-xs font-semibold text-cloud disabled:opacity-50"
            >
              Refuser
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
