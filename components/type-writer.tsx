"use client";

import { useEffect, useState } from "react";

/**
 * Effet « machine à écrire » du hero (style Bloop — décision porteur
 * 2026-07-25). Tape puis efface chaque mot en boucle, curseur clignotant.
 *
 * Accessibilité et 3G :
 *  - `prefers-reduced-motion` → premier mot affiché statiquement, zéro anim ;
 *  - rendu SERVEUR = premier mot complet : le titre est entier sans JS
 *    (lecture seule du catalogue garantie sans JS, même exigence qu'au
 *    chantier C) et pour les crawlers.
 */
export function TypeWriter({ words }: { words: string[] }) {
  const [reduced, setReduced] = useState<boolean | null>(null);
  const [wordIdx, setWordIdx] = useState(0);
  const [len, setLen] = useState(words[0]?.length ?? 0);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
  }, []);

  useEffect(() => {
    if (reduced !== false) return; // null = pas encore hydraté, true = statique
    const word = words[wordIdx] ?? "";
    let delay: number;
    if (!deleting && len < word.length) delay = 90;
    else if (!deleting && len === word.length) delay = 2200; // pause mot complet
    else if (deleting && len > 0) delay = 45;
    else delay = 350; // pause avant le mot suivant

    const timer = setTimeout(() => {
      if (!deleting && len === word.length) setDeleting(true);
      else if (deleting && len === 0) {
        setDeleting(false);
        setWordIdx((wordIdx + 1) % words.length);
      } else setLen(len + (deleting ? -1 : 1));
    }, delay);
    return () => clearTimeout(timer);
  }, [reduced, len, deleting, wordIdx, words]);

  const text =
    reduced === false ? (words[wordIdx] ?? "").slice(0, len) : words[0];

  return (
    <span className="whitespace-nowrap">
      {text}
      <span
        aria-hidden
        className={`ml-1 inline-block h-[0.9em] w-[3px] translate-y-[0.12em] bg-cloud align-baseline ${
          reduced === false ? "animate-pulse" : ""
        }`}
      />
    </span>
  );
}
