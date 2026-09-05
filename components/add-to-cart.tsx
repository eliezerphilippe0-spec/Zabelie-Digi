"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { appelSession } from "@/lib/appel-session";

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
    // Même porte que le bouton d'achat (`lib/appel-session.ts`). Le chemin de
    // retour vient de `iciMeme()`, qui garde la query : l'ancienne version
    // lisait `window.location.pathname` seul et ramenait `/catalogue?cat=Beauté`
    // sur `/catalogue` nu après connexion.
    const issue = await appelSession("/api/panier", { productId });

    if (issue.etat === "connexion") {
      // Pas de session : on emmène se connecter plutôt que d'échouer en
      // silence, et on revient ici après.
      router.push(issue.vers);
      return;
    }
    if (issue.etat !== "ok") {
      setMsg((issue.etat === "refus" ? issue.error : null) ?? labels.error);
      setEtat("repos");
      return;
    }
    setEtat("ajoute");
    router.refresh();
  }

  if (etat === "ajoute") {
    return (
      <div className="mt-3 text-center">
        {/* La coche ARRIVE (brief §3.3) : `reveal-mark`, une pulsation d'échelle
            en --motion-slow sur les tokens du thème, rien sous reduced-motion.
            SVG plutôt que le glyphe ✓, dont le dessin dépend de la police. */}
        <p className="reveal-mark inline-flex items-center gap-1.5 text-sm font-semibold text-success-text">
          <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-none stroke-current" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7" /></svg>
          {labels.added}
        </p>
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
