"use client";

import { useState } from "react";

export type DemandeDomaine = {
  sellerId: string; domaine: string; statut: "en_attente" | "actif" | "refuse";
  note: string | null; demandeLe: string; nom: string | null; slug: string | null;
};

const LIBELLE = { en_attente: "En attente", actif: "Actif", refuse: "Refusé" } as const;

/** Décisions sur les domaines vendeurs (0125). Outil interne, français assumé. */
export function DomainesAdmin({ demandes }: { demandes: DemandeDomaine[] }) {
  const [liste, setListe] = useState(demandes);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function decider(d: DemandeDomaine, action: "activer" | "refuser") {
    setBusy(d.sellerId);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/domaines", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sellerId: d.sellerId, action, note: notes[d.sellerId] ?? "" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setMessage(typeof data.error === "string" ? data.error : "Décision impossible."); return; }
      setListe((l) => l.map((x) => x.sellerId === d.sellerId ? { ...x, statut: action === "activer" ? "actif" : "refuse", note: action === "refuser" ? notes[d.sellerId] ?? null : null } : x));
    } catch { setMessage("Réseau indisponible."); }
    finally { setBusy(null); }
  }

  if (liste.length === 0) return <p className="mt-6 text-sm text-mist">Aucune demande.</p>;
  return (
    <div className="mt-6 grid gap-3">
      {message && <p role="alert" className="text-sm text-danger-text">{message}</p>}
      {liste.map((d) => (
        <div key={d.sellerId} className="rounded-2xl border border-line p-4 text-sm">
          <p className="font-mono text-base">{d.domaine}</p>
          <p className="mt-1 text-mist">{d.nom ?? "—"}{d.slug ? ` · /boutik/${d.slug}` : ""} · {LIBELLE[d.statut]}{d.note ? ` · ${d.note}` : ""}</p>
          {d.statut !== "actif" && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button type="button" disabled={busy === d.sellerId} onClick={() => decider(d, "activer")}
                className="inline-flex min-h-11 items-center rounded-xl bg-brand px-4 font-semibold text-on-brand disabled:opacity-60">Vérifier et activer</button>
              <input value={notes[d.sellerId] ?? ""} onChange={(e) => setNotes({ ...notes, [d.sellerId]: e.target.value })} placeholder="Motif du refus"
                maxLength={300} className="min-h-11 flex-1 rounded-xl border border-line bg-ink px-3" />
              <button type="button" disabled={busy === d.sellerId} onClick={() => decider(d, "refuser")}
                className="inline-flex min-h-11 items-center rounded-xl border border-line px-4">Refuser</button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
