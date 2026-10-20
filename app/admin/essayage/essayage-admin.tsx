"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { TableauEssayage } from "@/lib/essayage/admin";

/**
 * Panneau « Essayage virtuel » de l'administration (docs/74 §2.7, tâche 5.1) :
 * le compteur du mois, les réglages (plafond, quota, pause) et les vendeurs
 * pilotes. Chaque geste passe par `POST /api/admin/essayage`, qui revérifie le
 * rôle admin et la double authentification, puis écrit au journal d'audit.
 */
export function EssayageAdmin({
  tableau,
  vendeurs,
}: {
  tableau: TableauEssayage;
  /** Les vendeurs du back-office, pour en choisir un nouveau pilote. */
  vendeurs: { id: string; nom: string }[];
}) {
  const router = useRouter();
  const { compteur, pilotes } = tableau;
  const [plafond, setPlafond] = useState(String(compteur.plafond));
  const [quota, setQuota] = useState(String(compteur.quota));
  const [pause, setPause] = useState(compteur.pause);
  const [choisi, setChoisi] = useState("");
  const [occupe, setOccupe] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; texte: string } | null>(null);

  const pilotesIds = new Set(pilotes.map((p) => p.vendeurId));
  const candidats = vendeurs.filter((v) => !pilotesIds.has(v.id));

  async function envoyer(corps: Record<string, unknown>, reussite: string) {
    setOccupe(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/essayage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corps) });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Échec.");
      setMessage({ ok: true, texte: reussite });
      router.refresh();
    } catch (e) {
      setMessage({ ok: false, texte: e instanceof Error ? e.message : "Échec." });
    } finally {
      setOccupe(false);
    }
  }

  function regler(e: React.FormEvent) {
    e.preventDefault();
    const p = Number(plafond);
    const q = Number(quota);
    if (!Number.isInteger(p) || p < 0 || !Number.isInteger(q) || q < 0) {
      setMessage({ ok: false, texte: "Plafond et quota : des nombres entiers, 0 ou plus." });
      return;
    }
    void envoyer({ action: "regler", plafond: p, quota: q, pause }, "Réglages enregistrés.");
  }

  function retirer(id: string, nom: string) {
    if (!window.confirm(`Retirer « ${nom} » du pilote ? Ses fiches n'auront plus le bouton d'essayage.`)) return;
    void envoyer({ action: "retirer", vendeur: id }, `${nom} est retiré du pilote.`);
  }

  const champ = "mt-1 min-h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm";
  const bouton = "inline-flex min-h-11 items-center justify-center rounded-xl px-4 text-sm font-semibold transition disabled:opacity-60";

  return (
    <div className="mt-4 space-y-6" data-essayage-admin>
      <div className="rounded-xl border border-line bg-surface/60 p-4 text-sm">
        <p className="font-semibold">Ce mois-ci (heure d&apos;Haïti)</p>
        <p className="mt-1" data-essayage-compteur>
          {compteur.reussis} réussis, {compteur.enCours} en cours, {compteur.echecs} échecs (non comptés).
          Plafond {compteur.plafond}, reste {compteur.reste}.
        </p>
        {compteur.pause && <p className="mt-1 font-semibold text-danger-text">Essayage en pause pour tous.</p>}
        {!compteur.pause && compteur.reste === 0 && <p className="mt-1 font-semibold text-danger-text">Plafond atteint : l&apos;essayage est coupé jusqu&apos;au mois prochain.</p>}
      </div>

      <form onSubmit={regler} className="rounded-xl border border-line bg-surface/60 p-4 text-sm">
        <p className="font-semibold">Réglages</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block">
            Plafond du mois (essais)
            <input type="number" inputMode="numeric" min={0} step={1} value={plafond} onChange={(e) => setPlafond(e.target.value)} className={champ} />
          </label>
          <label className="block">
            Quota par acheteur et par jour
            <input type="number" inputMode="numeric" min={0} step={1} value={quota} onChange={(e) => setQuota(e.target.value)} className={champ} />
          </label>
        </div>
        <label className="mt-3 flex min-h-11 items-center gap-3">
          <input type="checkbox" checked={pause} onChange={(e) => setPause(e.target.checked)} className="h-5 w-5" />
          Mettre l&apos;essayage en pause
        </label>
        <button type="submit" disabled={occupe} className={`${bouton} bouton mt-3 bg-brand text-on-brand`}>
          Enregistrer les réglages
        </button>
      </form>

      <div className="rounded-xl border border-line bg-surface/60 p-4 text-sm">
        <p className="font-semibold">Vendeurs pilotes ({pilotes.length})</p>
        {pilotes.length === 0 ? (
          <p className="mt-2 text-mist">Aucun vendeur pilote : aucune fiche ne propose l&apos;essayage.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {pilotes.map((p) => (
              <li key={p.vendeurId} className="flex items-center justify-between gap-3">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{p.nom}</span>
                  <span className="text-xs text-mist">pilote depuis le {new Date(p.depuis).toLocaleDateString("fr-HT")}</span>
                </span>
                <button type="button" disabled={occupe} onClick={() => retirer(p.vendeurId, p.nom)} className={`${bouton} shrink-0 border border-line text-cloud hover:border-accent`}>
                  Retirer
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4 flex flex-wrap items-end gap-2">
          <label className="min-w-0 flex-1">
            Ajouter un vendeur
            <select value={choisi} onChange={(e) => setChoisi(e.target.value)} className={champ}>
              <option value="">Choisir…</option>
              {candidats.map((v) => (
                <option key={v.id} value={v.id}>{v.nom}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={occupe || !choisi}
            onClick={() => void envoyer({ action: "ajouter", vendeur: choisi }, "Vendeur ajouté au pilote.").then(() => setChoisi(""))}
            className={`${bouton} border border-line text-cloud hover:border-accent`}
          >
            Ajouter
          </button>
        </div>
      </div>

      {message && (
        <p role="status" className={message.ok ? "text-sm text-success-text" : "text-sm text-danger-text"}>
          {message.texte}
        </p>
      )}
    </div>
  );
}
