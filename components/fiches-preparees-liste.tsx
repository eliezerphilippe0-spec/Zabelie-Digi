"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MessageErreur } from "@/components/message-erreur";
import type { FichePrepareeListee } from "@/lib/fiche-preparee";

type Labels = Record<"empty" | "open" | "delete" | "confirmDelete" | "expires" | "taken" | "price" | "error", string>;

/**
 * LES FICHES PRÉPARÉES DU VENDEUR (lot 3b) — ce que ses assistants ont déposé.
 *
 * Sans cette liste, une fiche n'existait que par l'adresse rendue à
 * l'assistant : conversation perdue, fiche introuvable, et place bloquée dans
 * le plafond pendant sept jours. Ici le vendeur les retrouve, les ouvre dans
 * le bon formulaire, ou les supprime.
 *
 * Aucun bouton principal : ouvrir et supprimer sont secondaires. Le prix et la
 * date arrivent déjà mis en forme par le serveur.
 */
export function FichesPrepareesListe({ fiches, labels }: {
  fiches: (FichePrepareeListee & { prixAffiche: string | null; expireAffiche: string })[];
  labels: Labels;
}) {
  const router = useRouter();
  const [enCours, setEnCours] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  async function supprimer(id: string) {
    if (enCours || !window.confirm(labels.confirmDelete)) return;
    setEnCours(id); setErreur(null);
    try {
      const res = await fetch(`/api/account/fiches-preparees/${id}`, { method: "DELETE" });
      // 404 : déjà supprimée ou expirée entre-temps. La liste se rafraîchit de toute façon.
      if (!res.ok && res.status !== 404) { const c = await res.json().catch(() => ({})); setErreur(c.error ?? labels.error); return; }
      router.refresh();
    } catch { setErreur(labels.error); }
    finally { setEnCours(null); }
  }

  if (fiches.length === 0) return <p className="mt-4 text-sm text-mist">{labels.empty}</p>;
  return (
    <div className="mt-4 space-y-3" data-fiches-preparees>
      {erreur && <MessageErreur>{erreur}</MessageErreur>}
      <ul className="divide-y divide-line rounded-xl border border-line">
        {fiches.map((f) => (
          <li key={f.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 flex-1">
              <p className="break-words font-semibold">{f.titre}</p>
              <p className="mt-1 text-xs text-mist">
                {f.prixAffiche ? `${labels.price.replace("{price}", () => f.prixAffiche!)} · ` : ""}
                {labels.expires.replace("{date}", () => f.expireAffiche)}
                {f.dejaReprise ? ` · ${labels.taken}` : ""}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href={f.chemin} className="bouton bouton-secondaire bouton-compact">{labels.open}</Link>
              <button type="button" className="bouton bouton-secondaire bouton-compact text-danger-text" disabled={enCours !== null}
                aria-busy={enCours === f.id} onClick={() => void supprimer(f.id)}>
                {labels.delete}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
