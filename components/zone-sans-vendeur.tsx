"use client";

import { useState, useSyncExternalStore } from "react";

/**
 * Les deux gestes d'une zone sans vendeur (0162, docs/77 §12) :
 *
 *  • « Je cherche un vendeur ici » — un clic explicite, qui incrémente le compteur
 *    anonyme de la zone. Ni compte ni texte libre. Le navigateur retient qu'il a
 *    déjà dit chercher ICI (un seul clic par zone et par appareil) ; c'est une
 *    commodité, pas la garde : la route borne le débit de son côté.
 *  • « Inviter un vendeur » — un lien WhatsApp au message prérempli. Aucun numéro,
 *    aucune donnée : l'acheteur choisit lui-même le destinataire.
 *
 * Tous les libellés arrivent en props, résolus côté serveur : un composant client
 * ne lit pas le cookie de langue (tests/i18n-client-discipline.test.ts).
 */
export type ZoneSansVendeurLabels = {
  ask: string;
  asking: string;
  asked: string;
  error: string;
  share: string;
};

const EVENEMENT = "zabelie:zone-demande";
const cle = (zoneId: string) => `zabelie:zone-demande:${zoneId}`;

function lire(zoneId: string): boolean {
  try {
    return window.localStorage.getItem(cle(zoneId)) === "1";
  } catch {
    return false;
  }
}

function ecouter(rappel: () => void) {
  window.addEventListener(EVENEMENT, rappel);
  window.addEventListener("storage", rappel);
  return () => {
    window.removeEventListener(EVENEMENT, rappel);
    window.removeEventListener("storage", rappel);
  };
}

export function ZoneSansVendeur({ zoneId, labels, shareHref }: {
  zoneId: string;
  labels: ZoneSansVendeurLabels;
  shareHref: string;
}) {
  const dejaDit = useSyncExternalStore(ecouter, () => lire(zoneId), () => false);
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState(false);

  async function demander() {
    if (busy || dejaDit) return;
    setBusy(true);
    setErreur(false);
    try {
      const res = await fetch("/api/zone/demande", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ zoneId }),
      });
      if (!res.ok) {
        setErreur(true);
        return;
      }
      try {
        window.localStorage.setItem(cle(zoneId), "1");
      } catch {
        /* stockage indisponible : le compteur est déjà incrémenté, le bouton restera simplement actif */
      }
      window.dispatchEvent(new Event(EVENEMENT));
    } catch {
      setErreur(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-5 flex flex-col items-center gap-3">
      {dejaDit ? (
        <p role="status" className="max-w-md text-sm text-cloud">{labels.asked}</p>
      ) : (
        <button type="button" onClick={demander} disabled={busy}
          className="bouton min-h-11 rounded-xl bg-brand px-6 py-3 text-sm font-semibold text-on-brand disabled:opacity-60">
          {busy ? labels.asking : labels.ask}
        </button>
      )}
      {erreur ? <p role="alert" className="text-sm text-danger-text">{labels.error}</p> : null}
      <a href={shareHref} target="_blank" rel="noopener noreferrer"
        className="inline-flex min-h-11 items-center text-sm font-semibold text-accent underline underline-offset-4">
        {labels.share}
      </a>
    </div>
  );
}
