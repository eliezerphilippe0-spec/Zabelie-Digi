"use client";

import { useState } from "react";
import { enregistrementsDns } from "@/lib/domaines";

export type DomaineAffiche = { domaine: string; statut: "en_attente" | "actif" | "refuse"; note: string | null } | null;
type Labels = Record<
  "label" | "save" | "saving" | "remove" | "confirmRemove" | "pending" | "active" | "refused" | "dnsTitle" | "dnsType" | "dnsName" | "dnsValue" | "dnsHelp" | "error",
  string
>;

/** Domaine personnalisé du vendeur (0125) : demande, état, réglages DNS, retrait. */
export function DomainForm({ initial, labels }: { initial: DomaineAffiche; labels: Labels }) {
  const [actuel, setActuel] = useState<DomaineAffiche>(initial);
  const [saisie, setSaisie] = useState(initial?.domaine ?? "");
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState("");

  async function appeler(methode: "POST" | "DELETE") {
    setEnvoi(true);
    setErreur("");
    try {
      const res = await fetch("/api/account/domain", {
        method: methode,
        headers: { "Content-Type": "application/json" },
        body: methode === "POST" ? JSON.stringify({ domaine: saisie }) : undefined,
      });
      const corps = await res.json().catch(() => ({}));
      if (!res.ok) { setErreur(corps.error ?? labels.error); return; }
      if (methode === "DELETE") { setActuel(null); setSaisie(""); }
      else setActuel({ domaine: corps.domaine, statut: corps.statut, note: null });
    } catch { setErreur(labels.error); }
    finally { setEnvoi(false); }
  }

  return (
    <div className="mt-6 grid gap-4">
      <form onSubmit={(e) => { e.preventDefault(); appeler("POST"); }} className="grid gap-2">
        <label className="flex flex-col gap-1 text-sm">
          {labels.label}
          <input value={saisie} onChange={(e) => setSaisie(e.target.value)} placeholder="boutik-mari.com" inputMode="url"
            autoComplete="off" spellCheck={false} maxLength={253} className="min-h-11 rounded-xl border border-line bg-ink px-3 font-mono text-base" />
        </label>
        <div className="flex flex-wrap gap-3">
          <button type="submit" disabled={envoi} className="bouton inline-flex min-h-11 items-center rounded-xl bg-brand px-4 text-sm font-semibold text-on-brand disabled:opacity-60">
            {envoi ? labels.saving : labels.save}
          </button>
          {actuel && (
            <button type="button" disabled={envoi} onClick={() => { if (confirm(labels.confirmRemove)) appeler("DELETE"); }}
              className="inline-flex min-h-11 items-center rounded-xl border border-line px-4 text-sm">{labels.remove}</button>
          )}
        </div>
        {erreur && <p role="alert" className="text-sm text-danger-text">{erreur}</p>}
      </form>

      {actuel && (
        <div data-etat-domaine={actuel.statut} className="rounded-2xl border border-line p-4 text-sm">
          <p role="status" className={actuel.statut === "actif" ? "text-success-text" : actuel.statut === "refuse" ? "text-danger-text" : "text-cloud"}>
            {actuel.statut === "actif" ? labels.active.replace("{domaine}", actuel.domaine)
              : actuel.statut === "refuse" ? labels.refused.replace("{note}", actuel.note ?? "")
              : labels.pending}
          </p>
          {actuel.statut !== "actif" && (
            <>
              <h3 className="mt-4 font-semibold text-cloud">{labels.dnsTitle}</h3>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-left font-mono text-xs">
                  <thead><tr className="text-mist"><th className="py-1 pr-4">{labels.dnsType}</th><th className="py-1 pr-4">{labels.dnsName}</th><th className="py-1">{labels.dnsValue}</th></tr></thead>
                  <tbody>
                    {enregistrementsDns(actuel.domaine).map((r) => (
                      <tr key={r.type}><td className="py-1 pr-4">{r.type}</td><td className="py-1 pr-4">{r.nom}</td><td className="py-1 select-all">{r.valeur}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-xs text-mist">{labels.dnsHelp}</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
