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
  video = null,
  alt,
}: {
  /** L'URL de la couverture (déjà dimensionnée par l'appelant), ou null. */
  couverture: string | null;
  /** Les URLs des photos de la galerie, dans l'ordre. */
  medias: string[];
  /** L'URL de la vidéo (une seule, V-1B), ou null. */
  video?: string | null;
  alt: string;
}) {
  const images = [couverture, ...medias].filter((u): u is string => Boolean(u));
  // La vidéo est un ITEM de la galerie : vignette ▶, lecture sur tap dans la
  // zone principale — preload none, jamais d'autoplay (données comptées).
  const items: { type: "img" | "video"; url: string }[] = [
    ...images.map((url) => ({ type: "img" as const, url })),
    ...(video ? [{ type: "video" as const, url: video }] : []),
  ];
  const [principale, setPrincipale] = useState(0);

  if (items.length === 0) return null;
  const actif = items[Math.min(principale, items.length - 1)];

  return (
    <div className="space-y-3">
      {actif.type === "img" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={actif.url}
          alt={alt}
          decoding="async"
          className="aspect-[4/3] w-full rounded-3xl border border-line object-cover"
        />
      ) : (
        <video
          src={actif.url}
          controls
          preload="none"
          className="aspect-[4/3] w-full rounded-3xl border border-line bg-ink object-contain"
        />
      )}
      {items.length > 1 && (
        <div className="flex gap-2 overflow-x-auto">
          {items.map((m, i) => (
            <button
              key={m.url}
              type="button"
              onClick={() => setPrincipale(i)}
              aria-label={`${alt} ${i + 1}`}
              className={`relative shrink-0 overflow-hidden rounded-xl border ${
                i === principale ? "border-brand" : "border-line"
              }`}
            >
              {m.type === "img" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={m.url}
                  alt=""
                  width={72}
                  height={54}
                  decoding="async"
                  className="aspect-[4/3] w-18 object-cover"
                />
              ) : (
                <span className="flex aspect-[4/3] w-18 items-center justify-center bg-ink text-lg">
                  ▶
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
