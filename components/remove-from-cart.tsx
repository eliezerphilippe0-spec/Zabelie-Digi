"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Retrait d'une ligne du panier — un geste, pas un écran. */
export function RemoveFromCart({
  productId,
  label,
}: {
  productId: string;
  label: string;
}) {
  const router = useRouter();
  const [envoi, setEnvoi] = useState(false);

  async function retirer() {
    setEnvoi(true);
    try {
      await fetch(`/api/panier?productId=${encodeURIComponent(productId)}`, {
        method: "DELETE",
      });
      // Succès OU échec : on relit le serveur. Si le retrait a raté, la ligne
      // réapparaît — l'écran ne ment jamais sur l'état réel du panier.
      router.refresh();
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <button
      type="button"
      onClick={retirer}
      disabled={envoi}
      className="shrink-0 rounded-lg border border-line px-3 py-1.5 text-xs text-mist transition hover:border-danger hover:text-danger-text disabled:opacity-60"
    >
      {label}
    </button>
  );
}
