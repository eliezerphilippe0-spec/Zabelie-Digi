"use client";

import { useState, type ComponentProps } from "react";
import { AddToCart } from "@/components/add-to-cart";
import { EssayageFeuille } from "@/components/essayage-feuille";
import type { LibellesEssayage } from "@/lib/essayage/libelles";

/**
 * « Essayer sur moi », sous « Ajouter au panier » (docs/74 §2). La fiche ne
 * le rend que pour un acheteur connecté du groupe « essai », sur une fiche
 * éligible (`lib/essayage/fiche.ts`) ; la feuille ne se monte qu'au clic.
 */
export function EssayageBouton({
  produitId,
  labels,
  panier,
}: {
  produitId: string;
  labels: LibellesEssayage;
  panier: ComponentProps<typeof AddToCart>["labels"];
}) {
  const [ouvert, setOuvert] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => setOuvert(true)}
        data-essayage-bouton
        className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-brand/60 px-5 py-3 text-sm font-semibold text-cloud transition hover:border-brand"
      >
        {labels.bouton}
      </button>
      {ouvert && <EssayageFeuille produitId={produitId} labels={labels} panier={panier} onFermer={() => setOuvert(false)} />}
    </>
  );
}
