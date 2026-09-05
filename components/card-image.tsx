"use client";

import { useState } from "react";

/**
 * IMAGE DE CARTE — carrée, différée, fondue à l'arrivée (brief §4.4, §3.3).
 *
 * `loading="lazy"` diffère le téléchargement hors écran ; `decoding="async"`
 * ne bloque pas le rendu ; `width`/`height` égaux réservent un carré, donc
 * AUCUN saut de mise en page pendant le chargement (CLS 0). Le fond du
 * conteneur (`bg-line`, la teinte neutre des bordures) est le squelette :
 * il est visible tant que l'image n'est pas là, puis l'image passe de 0 à 1
 * en `--motion-base` — opacity seulement, jamais de hauteur.
 *
 * Client parce que `onLoad` l'exige ; il ne porte QUE cet état. Sous
 * `prefers-reduced-motion`, `--motion-base` vaut 0 ms (thème) : l'image
 * apparaît d'un coup, sans code de plus.
 *
 * `alt` porte le titre : c'est ce que lit quelqu'un dont l'image ne charge
 * pas — fréquent sur le terrain visé.
 */
export function CardImage({ src, alt, size }: { src: string; alt: string; size: number }) {
  const [chargee, setChargee] = useState(false);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      onLoad={() => setChargee(true)}
      className="absolute inset-0 h-full w-full object-cover transition-opacity"
      style={{ opacity: chargee ? 1 : 0, transitionDuration: "var(--motion-base)" }}
    />
  );
}
