"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type ReponseAvisLabels = {
  cta: string;
  placeholder: string;
  envoyer: string;
  annuler: string;
  aide: string;
  erreur: string;
  deja: string;
  reseau: string;
};

/**
 * Réponse du vendeur sous un avis (0139). Affiché par la fiche produit au SEUL
 * vendeur, et seulement sous un avis sans réponse ; la base refuse de toute
 * façon tout autre auteur et toute seconde réponse.
 */
export function ReponseAvisForm({ reviewId, labels }: { reviewId: string; labels: ReponseAvisLabels }) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [texte, setTexte] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function envoyer(e: React.FormEvent) {
    e.preventDefault();
    if (!texte.trim()) return;
    setEnvoi(true);
    setMsg(null);
    try {
      const res = await fetch("/api/reviews/reponse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewId, texte }),
      });
      if (!res.ok) {
        setMsg(res.status === 409 ? labels.deja : labels.erreur);
        return;
      }
      setOuvert(false);
      router.refresh();
    } catch {
      setMsg(labels.reseau);
    } finally {
      setEnvoi(false);
    }
  }

  if (!ouvert) {
    return (
      <div className="mt-3">
        <button
          type="button"
          onClick={() => setOuvert(true)}
          className="bouton bouton-secondaire bouton-compact"
        >
          {labels.cta}
        </button>
        {msg && <p className="mt-1 text-xs text-mist" role="status">{msg}</p>}
      </div>
    );
  }

  return (
    <form onSubmit={envoyer} className="mt-3 space-y-2">
      <label className="sr-only" htmlFor={`reponse-${reviewId}`}>{labels.cta}</label>
      <textarea
        id={`reponse-${reviewId}`}
        value={texte}
        onChange={(e) => setTexte(e.target.value)}
        maxLength={1000}
        rows={3}
        placeholder={labels.placeholder}
        className="champ"
      />
      <p className="text-xs text-mist">{labels.aide}</p>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={envoi || !texte.trim()}
          className="bouton bouton-primaire bouton-compact"
        >
          {labels.envoyer}
        </button>
        <button
          type="button"
          onClick={() => setOuvert(false)}
          className="bouton bouton-secondaire bouton-compact"
        >
          {labels.annuler}
        </button>
      </div>
      {msg && <p className="text-xs text-mist" role="status">{msg}</p>}
    </form>
  );
}
