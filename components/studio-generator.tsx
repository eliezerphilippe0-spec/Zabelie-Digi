"use client";

import { useRef, useState } from "react";
import { corpsDemande, lireReponse } from "@/lib/creative/studio";
import { PROPOSITION, type Cadrage, type Format } from "@/lib/creative/rule";

export type StudioLabels = {
  produit: string; format: string; cadrage: string;
  formats: Record<Format, string>; cadrages: Record<Cadrage, string>;
  lancer: string; encours: string;
  /** Contient « {prix} », remplacé par le prix servi par la route (402). */
  payant: string; payer: string;
  pret: string; revue: string; telecharger: string;
  echec: string; lent: string; erreur: string;
};

export type StudioProduit = { id: string; title: string; thumb: string; prixAffiche: string };

/** Un sondage toutes les 3 s, au plus 5 min : la route déclare l'échec au-delà de 15 min. */
const SONDAGE_MS = 3000;
const SONDAGES_MAX = 100;

type Etat =
  | { k: "repos" }
  | { k: "encours" }
  | { k: "payant"; prix: number }
  | { k: "pret"; url: string }
  | { k: "echec" }
  | { k: "lent" }
  | { k: "erreur"; message: string };

/**
 * Écran du Studio (Phase 4). Contrat avec les routes :
 *   - le vendeur choisit un produit, un cadrage et un format ; seul l'INDEX du
 *     brief part au serveur, qui compose le prompt (aucun texte libre) ;
 *   - une clé d'idempotence par clic : un double envoi ou un réseau qui
 *     rejoue ne paie jamais deux fois ;
 *   - 402 → le prix servi par le serveur est AFFICHÉ, et seul le bouton qui
 *     le montre renvoie la demande avec `prixConsentiHtg` ;
 *   - l'image rendue est à REVOIR par le vendeur (contrôle retenu, docs/62 §9).
 */
export function StudioGenerator({ produits, labels }: { produits: StudioProduit[]; labels: StudioLabels }) {
  const [produitId, setProduitId] = useState(produits[0]?.id ?? "");
  const [format, setFormat] = useState<Format>(PROPOSITION.formats[0]);
  const [cadrage, setCadrage] = useState<Cadrage>(PROPOSITION.cadrages[0]);
  const [etat, setEtat] = useState<Etat>({ k: "repos" });
  const cle = useRef<string | null>(null);

  const produit = produits.find((p) => p.id === produitId);
  const occupe = etat.k === "encours";

  async function suivre(id: string) {
    for (let i = 0; i < SONDAGES_MAX; i++) {
      await new Promise((r) => setTimeout(r, SONDAGE_MS));
      let lu: ReturnType<typeof lireReponse>;
      try {
        const res = await fetch(`/api/studio/generations/${id}`, { cache: "no-store" });
        if (!res.ok) continue;
        lu = lireReponse(res.status, await res.json());
      } catch {
        continue; // coupure réseau : on réessaie au prochain tour, sans rien resoumettre.
      }
      if (lu.k === "pret" || lu.k === "echec") return setEtat(lu);
    }
    setEtat({ k: "lent" });
  }

  async function lancer(prixConsentiHtg?: number) {
    if (!produit) return;
    // Nouvelle clé par nouvelle demande ; la MÊME pour le consentement qui la suit.
    if (prixConsentiHtg === undefined || !cle.current) cle.current = crypto.randomUUID();
    setEtat({ k: "encours" });
    try {
      const res = await fetch("/api/studio/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpsDemande(produit.id, cle.current, cadrage, format, prixConsentiHtg)),
      });
      const lu = lireReponse(res.status, await res.json().catch(() => ({})));
      if (lu.k === "suivre") return suivre(lu.id);
      if (lu.k === "erreur") return setEtat({ k: "erreur", message: lu.message ?? labels.erreur });
      setEtat(lu);
    } catch {
      setEtat({ k: "erreur", message: labels.erreur });
    }
  }

  const choix = "rounded-lg border px-3 py-2 text-xs font-semibold transition";
  const actif = (on: boolean) => (on ? "border-accent text-cloud" : "border-line text-mist hover:border-accent");

  return (
    <div className="space-y-5">
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold">{labels.produit}</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {produits.map((p) => (
            <button key={p.id} type="button" onClick={() => setProduitId(p.id)} disabled={occupe}
              aria-pressed={p.id === produitId}
              className={`${choix} ${actif(p.id === produitId)} flex flex-col items-start gap-2 text-left`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.thumb} alt="" className="aspect-square w-full rounded-lg object-cover" loading="lazy" />
              <span className="line-clamp-2">{p.title}</span>
              <span className="text-mist">{p.prixAffiche}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold">{labels.cadrage}</legend>
        <div className="flex flex-wrap gap-2">
          {PROPOSITION.cadrages.map((c) => (
            <button key={c} type="button" onClick={() => setCadrage(c)} disabled={occupe} aria-pressed={c === cadrage}
              className={`${choix} ${actif(c === cadrage)}`}>{labels.cadrages[c]}</button>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold">{labels.format}</legend>
        <div className="flex flex-wrap gap-2">
          {PROPOSITION.formats.map((f) => (
            <button key={f} type="button" onClick={() => setFormat(f)} disabled={occupe} aria-pressed={f === format}
              className={`${choix} ${actif(f === format)}`}>{labels.formats[f]}</button>
          ))}
        </div>
      </fieldset>

      <button type="button" onClick={() => lancer()} disabled={occupe || !produit}
        className="inline-flex min-h-11 items-center rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-on-brand transition hover:opacity-90 disabled:opacity-50">
        {occupe ? labels.encours : labels.lancer}
      </button>

      <div aria-live="polite" className="space-y-3">
        {etat.k === "payant" && (
          <div className="space-y-2 rounded-lg border border-line/60 p-3">
            <p className="text-sm text-mist">{labels.payant.replace("{prix}", String(etat.prix))}</p>
            <button type="button" onClick={() => lancer(etat.prix)}
              className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-on-brand transition hover:opacity-90">
              {labels.payer.replace("{prix}", String(etat.prix))}
            </button>
          </div>
        )}
        {etat.k === "pret" && (
          <div className="space-y-2">
            <p className="text-sm font-semibold">{labels.pret}</p>
            <p className="text-xs text-mist">{labels.revue}</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={etat.url} alt="" className="max-h-[70vh] w-auto rounded-lg border border-line" />
            <a href={etat.url} target="_blank" rel="noopener noreferrer" download
              className="inline-flex min-h-11 items-center text-sm text-accent underline">{labels.telecharger}</a>
          </div>
        )}
        {etat.k === "echec" && <p className="text-sm text-danger-text">{labels.echec}</p>}
        {etat.k === "lent" && <p className="text-sm text-mist">{labels.lent}</p>}
        {etat.k === "erreur" && <p className="text-sm text-danger-text">{etat.message}</p>}
      </div>
    </div>
  );
}
