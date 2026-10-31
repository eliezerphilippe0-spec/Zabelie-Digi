"use client";

import { useEffect, useState } from "react";

/**
 * NOTIFICATIONS DE VENTE, page fermée (niveau 2, 0169). Le vendeur abonne CET
 * appareil ; à chaque vente, le service worker affiche une notification
 * (`app/sw.ts`), même Zabelie fermée.
 *
 * • `clePublique` absente (clés VAPID non posées) : rien ne s'affiche.
 * • Navigateur sans notifications (iPhone hors écran d'accueil, par exemple) :
 *   on le DIT, avec le geste qui débloque.
 * • L'abonnement existant est réinscrit à chaque visite : si le serveur l'a
 *   perdu, il le retrouve sans que le vendeur ait rien à faire.
 */

export type NotificationsVenteLabels = {
  activer: string;
  actif: string;
  desactiver: string;
  nonSupporte: string;
  refuse: string;
  erreur: string;
  enCours: string;
};

type Etat = "chargement" | "non_supporte" | "refuse" | "inactif" | "actif" | "erreur" | "en_cours";

const ROUTE = "/api/seller/push";
const DELAI_SW_MS = 8000;

export function cleVersOctets(cle: string): Uint8Array<ArrayBuffer> {
  const base64 = cle.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(cle.length / 4) * 4, "=");
  const brut = atob(base64);
  const octets = new Uint8Array(new ArrayBuffer(brut.length));
  for (let i = 0; i < brut.length; i++) octets[i] = brut.charCodeAt(i);
  return octets;
}

function prise(): boolean {
  return typeof navigator !== "undefined" && "serviceWorker" in navigator && typeof window !== "undefined" && "PushManager" in window && "Notification" in window;
}

async function enregistrement(): Promise<ServiceWorkerRegistration | null> {
  // `ready` ne se résout jamais sans service worker : on borne l'attente.
  const delai = new Promise<null>((resoudre) => setTimeout(() => resoudre(null), DELAI_SW_MS));
  return Promise.race([navigator.serviceWorker.ready, delai]);
}

async function inscrire(endpoint: string, methode: "POST" | "DELETE"): Promise<boolean> {
  try {
    const r = await fetch(ROUTE, { method: methode, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint }) });
    return r.ok;
  } catch {
    return false;
  }
}

export function NotificationsVente({ clePublique, labels }: { clePublique: string | null; labels: NotificationsVenteLabels }) {
  const [etat, setEtat] = useState<Etat>("chargement");

  useEffect(() => {
    if (!clePublique) return;
    let vivant = true;
    (async () => {
      if (!prise()) return vivant && setEtat("non_supporte");
      if (Notification.permission === "denied") return vivant && setEtat("refuse");
      const reg = await navigator.serviceWorker.getRegistration();
      const abonnement = await reg?.pushManager.getSubscription();
      if (abonnement && (await inscrire(abonnement.endpoint, "POST"))) return vivant && setEtat("actif");
      if (vivant) setEtat("inactif");
    })().catch(() => vivant && setEtat("inactif"));
    return () => {
      vivant = false;
    };
  }, [clePublique]);

  async function activer() {
    if (!clePublique) return;
    setEtat("en_cours");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return setEtat(permission === "denied" ? "refuse" : "inactif");
      const reg = await enregistrement();
      if (!reg) return setEtat("erreur");
      const abonnement = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: cleVersOctets(clePublique) });
      if (await inscrire(abonnement.endpoint, "POST")) return setEtat("actif");
      // Le serveur n'a pas pris l'adresse : on ne laisse pas un abonnement orphelin.
      await abonnement.unsubscribe().catch(() => undefined);
      setEtat("erreur");
    } catch {
      setEtat("erreur");
    }
  }

  async function desactiver() {
    setEtat("en_cours");
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const abonnement = await reg?.pushManager.getSubscription();
      if (abonnement) {
        await inscrire(abonnement.endpoint, "DELETE");
        await abonnement.unsubscribe();
      }
      setEtat("inactif");
    } catch {
      setEtat("erreur");
    }
  }

  if (!clePublique || etat === "chargement") return null;
  return (
    <div className="mt-3 rounded-xl border border-line bg-surface/60 p-3 text-sm" aria-live="polite">
      {etat === "non_supporte" && <p className="text-mist">{labels.nonSupporte}</p>}
      {etat === "refuse" && <p className="text-mist">{labels.refuse}</p>}
      {etat === "actif" && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-mist">{labels.actif}</p>
          <button type="button" onClick={desactiver} className="inline-flex min-h-11 items-center underline">
            {labels.desactiver}
          </button>
        </div>
      )}
      {(etat === "inactif" || etat === "erreur") && (
        <>
          <button
            type="button"
            onClick={activer}
            className="bouton inline-flex min-h-11 items-center rounded-xl border border-line px-4 py-2 text-left font-semibold"
          >
            {labels.activer}
          </button>
          {etat === "erreur" && <p className="mt-1 text-danger-text">{labels.erreur}</p>}
        </>
      )}
      {etat === "en_cours" && <p className="text-mist">{labels.enCours}</p>}
    </div>
  );
}
