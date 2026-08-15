"use client";

import { useState } from "react";

/**
 * Galerie de la fiche produit (V-1A, docs/35) — l'inverse exact de la
 * galerie factice retirée par BL-119 : les vignettes n'existent que s'il y a
 * de VRAIES photos derrière. Zéro média → le composant ne rend rien, la
 * fiche garde sa couverture seule (le rendu serveur d'avant).
 *
 * `principale` démarre sur la couverture ; un tap sur une vignette la
 * remplace. Pas de lightbox, pas d'autoplay — Android d'entrée de gamme,
 * données comptées.
 */
export function GalerieProduit({
  couverture,
  medias,
  alt,
}: {
  /** L'URL de la couverture (déjà dimensionnée par l'appelant), ou null. */
  couverture: string | null;
  /** Les URLs de la galerie, dans l'ordre. */
  medias: string[];
  alt: string;
}) {
  const toutes = [couverture, ...medias].filter(
    (u): u is string => Boolean(u)
  );
  const [principale, setPrincipale] = useState(0);

  if (toutes.length === 0) return null;

  return (
    <div className="space-y-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={toutes[principale]}
        alt={alt}
        decoding="async"
        className="aspect-[4/3] w-full rounded-3xl border border-line object-cover"
      />
      {toutes.length > 1 && (
        <div className="flex gap-2 overflow-x-auto">
          {toutes.map((u, i) => (
            <button
              key={u}
              type="button"
              onClick={() => setPrincipale(i)}
              aria-label={`${alt} ${i + 1}`}
              className={`shrink-0 overflow-hidden rounded-xl border ${
                i === principale ? "border-brand" : "border-line"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={u}
                alt=""
                width={72}
                height={54}
                decoding="async"
                className="aspect-[4/3] w-18 object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
