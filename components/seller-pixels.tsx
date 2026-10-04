"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { COOKIE_CONSENTEMENT, DUREE_CONSENTEMENT_S, lireConsentement, type Consentement, type EvenementPixel, type IdsPixels } from "@/lib/pixels";
import { chargerPixels } from "@/lib/pixels-client";

type Labels = { text: string; accept: string; refuse: string; privacy: string };

const aucunAbonnement = () => () => {};

/**
 * Pixels du vendeur + bandeau de consentement.
 *
 * Rien ne se charge avant un « oui » explicite. « Non » est retenu 180 jours,
 * comme « oui » : on ne harcèle pas. Le bandeau n'existe que sur les pages
 * d'un vendeur qui a configuré un pixel — ailleurs, aucun bandeau, aucun
 * traceur. Côté serveur, l'état est « serveur » : ni bandeau ni chargement
 * avant que le navigateur ait lu le cookie (pas d'écart d'hydratation).
 */
export function SellerPixels({ ids, evenement, labels }: { ids: IdsPixels; evenement: EvenementPixel; labels: Labels }) {
  const lu = useSyncExternalStore<Consentement | "serveur">(aucunAbonnement, () => lireConsentement(document.cookie), () => "serveur");
  const [choix, setChoix] = useState<Consentement | null>(null);
  const consentement = choix ?? lu;
  const charge = useRef(false);

  useEffect(() => {
    if (consentement !== "oui" || charge.current) return;
    charge.current = true;
    chargerPixels(ids, evenement);
  }, [consentement, ids, evenement]);

  function choisir(oui: boolean) {
    document.cookie = `${COOKIE_CONSENTEMENT}=${oui ? 1 : 0}; Max-Age=${DUREE_CONSENTEMENT_S}; Path=/; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
    setChoix(oui ? "oui" : "non");
  }

  const demander = consentement === "inconnu";
  if (!demander) return null;
  return (
    <div role="dialog" aria-live="polite" aria-label={labels.privacy} data-bandeau-pixels
      className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-lg rounded-2xl border border-line bg-surface p-4 text-sm shadow-lg">
      <p className="text-cloud">{labels.text} <Link href="/confidentialite" className="underline">{labels.privacy}</Link></p>
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <button type="button" onClick={() => choisir(false)} className="inline-flex min-h-11 items-center rounded-xl border border-line px-4">{labels.refuse}</button>
        <button type="button" onClick={() => choisir(true)} className="bouton inline-flex min-h-11 items-center rounded-xl bg-brand px-4 font-semibold text-on-brand">{labels.accept}</button>
      </div>
    </div>
  );
}
