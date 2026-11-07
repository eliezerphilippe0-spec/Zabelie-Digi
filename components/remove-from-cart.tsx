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
      className="bouton bouton-secondaire bouton-compact shrink-0"
    >
      {label}
    </button>
  );
}
