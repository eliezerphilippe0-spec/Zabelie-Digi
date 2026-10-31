"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * SON DE VENTE — « Mes ventes », page ouverte (niveau 1, choix du porteur le
 * 2026-10-31). Un signal retentit quand le nombre de ventes confirmées du
 * vendeur augmente (`/api/seller/ventes-compte`), et la liste se recharge.
 *
 * ─── CE QUE ÇA FAIT ET NE FAIT PAS ─────────────────────────────────────────
 * • Le vendeur appuie UNE fois sur « Activer le son » : les navigateurs
 *   refusent de jouer un son sans geste de l'utilisateur. Le geste joue le
 *   signal une première fois, pour qu'il sache ce qu'il entendra.
 * • Page fermée, rien ne sonne : c'est le niveau 2 (notifications), non fait.
 * • Le son est SYNTHÉTISÉ (Web Audio) : aucun fichier à télécharger.
 * • Rien n'est mémorisé sur l'appareil : après un rechargement, le navigateur
 *   exige de toute façon un nouveau geste.
 * • Le signal est aussi ÉCRIT (zone `aria-live`) : un vendeur qui n'entend pas
 *   le voit.
 */

export type SonVentesLabels = { activer: string; actif: string; couper: string; nouvelle: string };

export const INTERVALLE_MS = 30_000;

/** « Ka-ching » : deux notes brèves et claires, la seconde plus haute. */
export function jouerCaisse(ctx: AudioContext): void {
  const debut = ctx.currentTime;
  for (const [decalage, frequence] of [[0, 1318.5], [0.12, 1760]] as const) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.value = frequence;
    gain.gain.setValueAtTime(0.0001, debut + decalage);
    gain.gain.exponentialRampToValueAtTime(0.35, debut + decalage + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, debut + decalage + 0.35);
    osc.connect(gain).connect(ctx.destination);
    osc.start(debut + decalage);
    osc.stop(debut + decalage + 0.4);
  }
}

export function SonVentes({ labels }: { labels: SonVentesLabels }) {
  const router = useRouter();
  const [actif, setActif] = useState(false);
  const [nouvelles, setNouvelles] = useState(0);
  const ctxRef = useRef<AudioContext | null>(null);
  const base = useRef<number | null>(null);

  useEffect(() => {
    if (!actif) return;
    let arret = false;
    const verifier = async () => {
      if (arret || navigator.onLine === false) return;
      try {
        const reponse = await fetch("/api/seller/ventes-compte", { cache: "no-store" });
        if (!reponse.ok) return;
        const { ventes } = (await reponse.json()) as { ventes?: unknown };
        if (arret || typeof ventes !== "number") return;
        const avant = base.current;
        base.current = ventes;
        // Le premier relevé fixe la référence : il ne sonne jamais.
        if (avant !== null && ventes > avant) {
          setNouvelles((n) => n + (ventes - avant));
          if (ctxRef.current) jouerCaisse(ctxRef.current);
          router.refresh();
        }
      } catch {
        // Réseau coupé : le passage suivant réessaie.
      }
    };
    void verifier();
    const minuterie = window.setInterval(verifier, INTERVALLE_MS);
    const auRetour = () => {
      if (document.visibilityState === "visible") void verifier();
    };
    document.addEventListener("visibilitychange", auRetour);
    return () => {
      arret = true;
      window.clearInterval(minuterie);
      document.removeEventListener("visibilitychange", auRetour);
    };
  }, [actif, router]);

  function activer() {
    const Contexte =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Contexte) {
      ctxRef.current ??= new Contexte();
      void ctxRef.current.resume();
      jouerCaisse(ctxRef.current);
    }
    base.current = null;
    setActif(true);
  }

  function couper() {
    base.current = null;
    setNouvelles(0);
    setActif(false);
  }

  return (
    <div className="mt-4 rounded-xl border border-line bg-surface/60 p-3 text-sm">
      {actif ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-mist">{labels.actif}</p>
          <button type="button" onClick={couper} className="inline-flex min-h-11 items-center underline">
            {labels.couper}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={activer}
          className="bouton inline-flex min-h-11 items-center rounded-xl border border-line px-4 py-2 font-semibold"
        >
          {labels.activer}
        </button>
      )}
      <p aria-live="polite" className="mt-1 font-semibold text-success-text">
        {nouvelles > 0 ? labels.nouvelle : ""}
      </p>
    </div>
  );
}
