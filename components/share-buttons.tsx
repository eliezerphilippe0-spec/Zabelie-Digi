"use client";

import { useState } from "react";

/**
 * Vente par lien — la force de Chariow, adaptée au canal n°1 haïtien :
 * WhatsApp. Chaque produit/boutique se partage en un tap.
 */
export function ShareButtons({
  path,
  text,
  waLabel = "Partager sur WhatsApp",
  copyLabel = "Copier le lien",
  copiedLabel = "Lien copié ✓",
}: {
  path: string; // ex: /produit/mon-slug
  text: string; // message pré-rempli
  waLabel?: string;
  copyLabel?: string;
  copiedLabel?: string;
}) {
  const [copied, setCopied] = useState(false);

  function url() {
    return `${window.location.origin}${path}`;
  }

  function shareWhatsApp() {
    const msg = encodeURIComponent(`${text} ${url()}`);
    window.open(`https://wa.me/?text=${msg}`, "_blank", "noopener");
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // navigateurs anciens : sélection manuelle
      window.prompt("Copiez le lien :", url());
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={shareWhatsApp}
        className="flex items-center gap-1.5 inline-flex min-h-11 items-center rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-cloud transition hover:border-success/60"
      >
        <span className="text-success">🟢</span> {waLabel}
      </button>
      <button
        onClick={copyLink}
        className="inline-flex min-h-11 items-center rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-mist transition hover:border-accent/50 hover:text-cloud"
      >
        {copied ? copiedLabel : copyLabel}
      </button>
    </div>
  );
}
