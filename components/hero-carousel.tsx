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
  /**
   * Chiffre-choc facultatif, ex. « 0 HTG » — la pastille de la maquette.
   * OPTIONNEL À DESSEIN : un slide qui n'a rien de chiffré à dire n'en met
   * pas, plutôt que d'inventer un nombre pour remplir la case.
   */
  badge?: string;
  /** Second geste facultatif — aujourd'hui WhatsApp, masqué si absent. */
  secondHref?: string;
  secondCta?: string;
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
      {/* Ratio élargi (maquette porteur) : ~4:3 mobile, ~16:9 dès sm — c'est
          une BANNIÈRE, plus un bandeau. Toujours zéro image : sur Android
          d'entrée de gamme et 3G, une photo de hero coûte plus cher que tout
          le reste de la page réunie. Le jour où des photos terrain existent,
          elles remplacent `accent` slide par slide (lib/landing-slides.ts).

          ⚠️ LE TEXTE RESTE DU TEXTE, jamais incrusté dans une image : le site
          porte quatre langues, un lecteur d'écran doit le lire, et à 360 px
          une typographie gravée devient illisible. */}
      <div
        /* UI-01 — `aspect-[4/3] sm:aspect-[16/9]` fixait la hauteur sur la
           LARGEUR : à 1440 px le bloc mesurait ~350 px pour ~120 px de
           contenu, soit 230 px de dégradé vide au centre de la zone la
           plus regardée. Le ratio réservait la place d'un visuel qui
           n'existe pas encore.

           `min-h` plutôt que rien du tout : sans plancher, les trois
           diapositives prendraient des hauteurs différentes (l'une porte
           un badge de prix, l'autre un second bouton) et le carrousel
           sauterait à chaque défilement. Le plancher garde l'uniformité
           en rendant la place au contenu. */
        className={`flex min-h-52 flex-col items-center justify-center gap-4 rounded-3xl bg-gradient-to-br px-6 py-10 text-center sm:min-h-56 ${slide.accent}`}
      >
        {/* `font-heading` explicite : ce titre est un `<p>`, pas un `h*`, donc
            la règle de `globals.css` ne l'atteint pas. Sans cette classe il
            restait la SEULE grande écriture de l'accueil en grotesque après
            le passage au serif — un écart qui se lit comme un oubli.
            Le badge en dessous garde Inter à dessein : il porte un PRIX, et
            les chiffres d'un serif à forte modulation se confondent à petite
            taille sur un écran d'entrée de gamme. */}
        <p className="max-w-2xl font-heading text-2xl font-extrabold leading-tight tracking-tight text-ink sm:text-4xl">
          {slide.title}
        </p>
        {slide.badge && (
          <p className="rounded-xl bg-ink px-4 py-1.5 text-2xl font-extrabold tracking-tight text-brand sm:text-3xl">
            {slide.badge}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Link
            href={slide.href}
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-ink px-5 text-sm font-semibold text-cloud transition hover:opacity-90"
          >
            {slide.cta}
          </Link>
          {slide.secondHref && slide.secondCta && (
            <a
              href={slide.secondHref}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border-2 border-ink px-5 text-sm font-bold text-ink transition hover:bg-ink/10"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-none stroke-ink" strokeWidth="1.8">
                <path d="M4 5h16v11H9l-5 4V5z" />
              </svg>
              {slide.secondCta}
            </a>
          )}
        </div>
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
