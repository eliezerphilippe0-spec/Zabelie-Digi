"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

/**
 * Carrousel du hero — délibérément petit.
 *
 * Un slide = une phrase + un CTA, composé sur un dégradé du thème (pas
 * d'image → zéro CLS, zéro octet à télécharger sur 3G). Autoplay 6 s,
 * suspendu au survol, au focus clavier ET si `prefers-reduced-motion` —
 * un carrousel qui bouge sous le doigt d'un lecteur d'écran est une nuisance,
 * pas une animation. Balayage tactile : un seuil de 40 px, rien de plus.
 *
 * Composant client → libellés en props (règle lib/i18n.ts, vérifiée par
 * tests/i18n-client-discipline.test.ts).
 */
export type CarouselSlide = {
  title: string;
  cta: string;
  href: string;
  accent: string;
};

export function HeroCarousel({
  slides,
  gotoLabel,
}: {
  slides: CarouselSlide[];
  /** Préfixe d'accessibilité des puces, ex. « Ale nan pano ». */
  gotoLabel: string;
}) {
  const [actif, setActif] = useState(0);
  const [suspendu, setSuspendu] = useState(false);
  const departX = useRef<number | null>(null);

  useEffect(() => {
    if (slides.length < 2 || suspendu) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const minuterie = setInterval(
      () => setActif((a) => (a + 1) % slides.length),
      6000
    );
    return () => clearInterval(minuterie);
  }, [slides.length, suspendu]);

  if (slides.length === 0) return null;
  const slide = slides[actif];

  return (
    <section
      aria-roledescription="carousel"
      aria-label={slide.title}
      onMouseEnter={() => setSuspendu(true)}
      onMouseLeave={() => setSuspendu(false)}
      onFocus={() => setSuspendu(true)}
      onBlur={() => setSuspendu(false)}
      onTouchStart={(e) => {
        departX.current = e.touches[0].clientX;
      }}
      onTouchEnd={(e) => {
        if (departX.current === null) return;
        const delta = e.changedTouches[0].clientX - departX.current;
        departX.current = null;
        if (Math.abs(delta) < 40) return;
        setActif((a) => (a + (delta < 0 ? 1 : -1) + slides.length) % slides.length);
      }}
    >
      {/* Ratio contenu : ~2:1 mobile, ~3:1 dès sm — le hero est un bandeau,
          pas un écran. */}
      <div
        className={`flex aspect-[2/1] flex-col items-center justify-center gap-4 rounded-3xl bg-gradient-to-br px-6 text-center sm:aspect-[3/1] ${slide.accent}`}
      >
        <p className="max-w-2xl text-xl font-extrabold leading-tight tracking-tight text-ink sm:text-3xl">
          {slide.title}
        </p>
        <Link
          href={slide.href}
          className="rounded-xl bg-ink px-5 py-2.5 text-sm font-semibold text-cloud transition hover:opacity-90"
        >
          {slide.cta}
        </Link>
      </div>

      {slides.length > 1 && (
        <div className="mt-3 flex justify-center gap-2">
          {slides.map((s, i) => (
            <button
              key={s.href + i}
              type="button"
              onClick={() => setActif(i)}
              aria-label={`${gotoLabel} ${i + 1}`}
              aria-current={i === actif}
              // Cible 44×44 (BL-124) autour d'une puce visuelle plus petite.
              className="grid h-11 w-11 place-items-center"
            >
              <span
                aria-hidden="true"
                className={`h-2 rounded-full transition-all ${
                  i === actif ? "w-6 bg-accent" : "w-2 bg-mist/50"
                }`}
              />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
