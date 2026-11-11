"use client";

import { useState } from "react";
import type { FicheRecue } from "@/components/import-fiche";
import type { FichePrepareeLue } from "@/lib/fiche-preparee";

export type FichePrepareeLabels = {
  title: string;
  /** Contient `{key}` : le nom de la clé d'API qui a déposé la fiche. */
  hint: string;
  /** Quand la clé n'existe plus. */
  hintNoKey: string;
  /** Contient `{price}`. */
  price: string;
  cta: string;
  done: string;
  already: string;
};

/**
 * FICHE PRÉPARÉE PAR UN ASSISTANT (lot 3b, 2026-11-11) — le vendeur a ouvert
 * l'adresse que son assistant lui a remise ; ce bloc lui montre ce qui a été
 * préparé et lui laisse le REPRENDRE dans le formulaire.
 *
 * Rien n'est rempli sans son geste. La reprise passe par la même fonction que
 * l'import par lien (`onReprendre`) : une saisie existante n'est remplacée
 * qu'avec son accord, et l'acceptation de la politique retombe. C'est LUI qui
 * coche la politique et qui envoie : ce composant n'envoie rien.
 *
 * Bouton SECONDAIRE : l'action principale du formulaire reste l'envoi de la fiche.
 */
export function FichePreparee({ fiche, labels, prixAffiche, disabled = false, onReprendre }: {
  fiche: FichePrepareeLue;
  labels: FichePrepareeLabels;
  /** Le prix proposé, déjà mis en forme par le serveur ; `null` s'il n'y en a pas. */
  prixAffiche: string | null;
  disabled?: boolean;
  onReprendre: (fiche: FicheRecue) => boolean;
}) {
  const [fait, setFait] = useState(false);

  function reprendre() {
    if (disabled) return;
    if (!onReprendre({ titre: fiche.titre, description: fiche.description, marque: null, prixHtg: fiche.prixHtg })) return;
    setFait(true);
    // Libère une place dans le plafond des fiches en attente. Un échec ne retire
    // rien au vendeur : le texte est déjà dans son formulaire.
    void fetch(`/api/account/fiches-preparees/${fiche.id}/reprise`, { method: "POST" }).catch(() => {});
  }

  return (
    <fieldset data-fiche-preparee className="rounded-xl border border-line p-4">
      <legend className="px-1 text-sm font-semibold">{labels.title}</legend>
      <p className="text-sm leading-relaxed text-mist">{fiche.cle ? labels.hint.replace("{key}", fiche.cle) : labels.hintNoKey}</p>
      <p className="mt-3 break-words text-sm font-semibold">{fiche.titre}</p>
      {prixAffiche && <p className="mt-1 text-sm text-mist">{labels.price.replace("{price}", prixAffiche)}</p>}
      {fiche.dejaReprise && !fait && <p className="mt-2 text-xs leading-relaxed text-mist">{labels.already}</p>}
      <button type="button" className="bouton bouton-secondaire mt-3" disabled={disabled} onClick={reprendre}>
        {labels.cta}
      </button>
      {fait && <p role="status" className="mt-2 text-sm text-success-text">{labels.done}</p>}
    </fieldset>
  );
}
