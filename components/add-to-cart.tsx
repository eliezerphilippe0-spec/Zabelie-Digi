"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * « Ajouter au panier » — le geste, pas le paiement.
 *
 * Il vit À CÔTÉ du bouton « Payer avec MonCash », qui reste le chemin direct
 * d'un produit unique. Le panier ne remplace rien : il ajoute le cas « je
 * prends plusieurs choses », que la marketplace n'avait pas.
 *
 * L'appel passe par une route serveur, jamais par la base côté client : c'est
 * elle qui vérifie la session, que le produit est publié, et qu'un vendeur
 * n'achète pas chez lui. Un bouton client qui écrirait en base ferait
 * confiance au navigateur pour dire qui il est.
 */
export function AddToCart({
  productId,
  labels,
}: {
  productId: string;
  labels: {
    add: string;
    adding: string;
    added: string;
    seeCart: string;
    signin: string;
    error: string;
  };
}) {
  const router = useRouter();
  const [etat, setEtat] = useState<"repos" | "envoi" | "ajoute">("repos");
  const [msg, setMsg] = useState<string | null>(null);

  async function ajouter() {
    setEtat("envoi");
    setMsg(null);
    try {
      const res = await fetch("/api/panier", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId }),
      });
      if (res.status === 401) {
        // Pas de session : on emmène se connecter plutôt que d'échouer en
        // silence, et on revient ici après.
        router.push(`/connexion?next=${encodeURIComponent(window.location.pathname)}`);
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(data.error ?? labels.error);
        setEtat("repos");
        return;
      }
      setEtat("ajoute");
      router.refresh();
    } catch {
      setMsg(labels.error);
      setEtat("repos");
    }
  }

  if (etat === "ajoute") {
    return (
      <div className="mt-3 text-center">
        <p className="text-sm font-semibold text-success-text">✓ {labels.added}</p>
        <a
          href="/panier"
          className="mt-2 inline-block rounded-xl border border-line px-5 py-2.5 text-sm font-semibold text-cloud transition hover:border-brand/60"
        >
          {labels.seeCart}
        </a>
      </div>
    );
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={ajouter}
        disabled={etat === "envoi"}
        className="w-full rounded-xl border border-line px-5 py-3 text-sm font-semibold text-cloud transition hover:border-brand/60 disabled:opacity-60"
      >
        {etat === "envoi" ? labels.adding : labels.add}
      </button>
      {msg && <p className="mt-2 text-center text-xs text-danger-text">{msg}</p>}
    </div>
  );
}
