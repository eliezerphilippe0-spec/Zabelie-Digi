"use client";

import { useState, useSyncExternalStore } from "react";
import { lireConsentement, type Consentement } from "@/lib/pixels";
import { ecrireConsentement } from "@/lib/pixels-client";

type Labels = { title: string; current: string; yes: string; no: string; none: string; saved: string; hint: string; accept: string; refuse: string };

const aucunAbonnement = () => () => {};

/**
 * « GÉRER LES TRACEURS » — le centre de préférences, à la manière des grandes
 * plateformes : l'état actuel affiché, et deux boutons de même poids pour
 * accepter ou refuser. Retirer son accord doit être aussi simple que le
 * donner : un clic, depuis le lien présent en bas de chaque page
 * (`/confidentialite#traceurs`), sans effacer ses cookies à la main.
 *
 * Même cookie que le bandeau (`zab_pub`), même écriture (`ecrireConsentement`) :
 * un refus efface aussi les cookies que les régies avaient posés.
 */
export function TrackerPreferences({ labels }: { labels: Labels }) {
  const lu = useSyncExternalStore<Consentement | "serveur">(aucunAbonnement, () => lireConsentement(document.cookie), () => "serveur");
  const [choix, setChoix] = useState<Consentement | null>(null);
  const etat = choix ?? lu;

  function choisir(oui: boolean) {
    ecrireConsentement(oui);
    setChoix(oui ? "oui" : "non");
  }

  const libelle = etat === "oui" ? labels.yes : etat === "non" ? labels.no : etat === "inconnu" ? labels.none : "…";
  return (
    <div data-preferences-traceurs className="mt-4 rounded-2xl border border-line bg-surface p-4">
      <h3 className="text-base font-semibold text-cloud">{labels.title}</h3>
      <p className="mt-2 text-sm">
        {labels.current} <strong className="text-cloud" data-etat={etat}>{libelle}</strong>
      </p>
      <p className="mt-1 text-xs text-mist">{labels.hint}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => choisir(false)} aria-pressed={etat === "non"} className="inline-flex min-h-11 items-center rounded-xl border border-line px-4">{labels.refuse}</button>
        <button type="button" onClick={() => choisir(true)} aria-pressed={etat === "oui"} className="inline-flex min-h-11 items-center rounded-xl border border-line px-4">{labels.accept}</button>
      </div>
      <p role="status" aria-live="polite" className="mt-2 min-h-5 text-xs text-mist">{choix ? labels.saved : ""}</p>
    </div>
  );
}
