"use client";

import { useEffect, useRef, useState } from "react";

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
 * ⚠️ VISIBLE PAR DÉFAUT, et c'est ce qui rend le fondu sûr sur 3G. La
 * première version rendait `opacity: 0` côté serveur et attendait `onLoad`
 * pour révéler : avant l'hydratation — plusieurs secondes sur le terrain
 * visé — toutes les images étaient invisibles, et une image déjà chargée
 * QUAND React s'attache ne déclenche plus jamais `onLoad` : elle restait
 * invisible pour toujours (revue Phase 5, `docs/REVUE-2026-09-04.md`
 * UX-01). Désormais : le serveur rend l'image visible ; au montage, seule
 * une image PAS ENCORE arrivée (`!img.complete`) est masquée, puis fondue
 * à son `onLoad`. Sans JavaScript, rien n'est jamais caché.
 *
 * Sous `prefers-reduced-motion`, `--motion-base` vaut 0 ms (thème) :
 * l'image apparaît d'un coup, sans code de plus.
 *
 * `alt` porte le titre : c'est ce que lit quelqu'un dont l'image ne charge
 * pas — fréquent sur le terrain visé.
 */
export function CardImage({ src, alt, size }: { src: string; alt: string; size: number }) {
  const ref = useRef<HTMLImageElement>(null);
  const [masquee, setMasquee] = useState(false);

  useEffect(() => {
    const img = ref.current;
    if (img && !img.complete) setMasquee(true);
  }, []);

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={ref}
      src={src}
      alt={alt}
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      onLoad={() => setMasquee(false)}
      className="absolute inset-0 h-full w-full object-cover transition-opacity"
      style={{ opacity: masquee ? 0 : 1, transitionDuration: "var(--motion-base)" }}
    />
  );
}
