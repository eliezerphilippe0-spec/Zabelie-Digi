"use client";

import { useEffect, useState } from "react";

/**
 * Compte à rebours d'une offre flash (fiche produit). Purement décoratif :
 * la fenêtre qui FAIT FOI est relue par le serveur au checkout — un onglet
 * resté ouvert au-delà de la fin verra le refus explicite du serveur, jamais
 * un prix flash fantôme.
 */
export function FlashCountdown({ fin, prefix }: { fin: string; prefix: string }) {
  const [reste, setReste] = useState(() => Date.parse(fin) - Date.now());

  useEffect(() => {
    const t = setInterval(() => setReste(Date.parse(fin) - Date.now()), 1000);
    return () => clearInterval(t);
  }, [fin]);

  if (reste <= 0) return null;
  const h = Math.floor(reste / 3600_000);
  const m = Math.floor((reste % 3600_000) / 60_000);
  const s = Math.floor((reste % 60_000) / 1000);
  const deux = (n: number) => String(n).padStart(2, "0");

  return (
    <span className="numeric text-xs font-bold text-brand">
      {prefix} {h > 0 ? `${h}:${deux(m)}:${deux(s)}` : `${m}:${deux(s)}`}
    </span>
  );
}
