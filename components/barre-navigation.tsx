"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icone } from "@/components/icone";
import { entreeActive } from "@/lib/barre-navigation";

/**
 * BARRE DE NAVIGATION INFÉRIEURE — chantier design, Phase 4.5 (V-28 A19).
 *
 * Mobile seulement (`md:hidden`) : sur ordinateur, l'en-tête porte déjà tout.
 * Quatre entrées et non cinq : la recherche est déjà une barre collante en haut
 * de chaque page, une entrée « recherche » la doublerait. Le panier et le compte
 * quittent l'en-tête mobile pour venir ici, sous le pouce ; le menu du compte
 * (où vivent WhatsApp, l'aide et la déconnexion) s'ouvre vers le haut.
 *
 * Client pour deux raisons seulement : `aria-current` suit la page affichée, et
 * le menu du compte se referme au clic extérieur et à Échap, comme celui de
 * l'en-tête (`components/header-shell.tsx` ne gère que les menus de l'en-tête).
 * `tests/parcours-phase4.test.ts` garde.
 */
export function BarreNavigation({
  libelles,
  articlesPanier,
  compte,
}: {
  libelles: { nav: string; accueil: string; rayons: string; panier: string };
  articlesPanier: number | null;
  compte: React.ReactNode;
}) {
  const chemin = usePathname() ?? "/";
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const nav = ref.current;
    if (!nav) return;
    const ouverts = () => nav.querySelectorAll<HTMLDetailsElement>("details[open]");
    const dehors = (e: Event) => ouverts().forEach((d) => { if (!d.contains(e.target as Node)) d.open = false; });
    const echap = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      ouverts().forEach((d) => { d.open = false; d.querySelector("summary")?.focus({ preventScroll: true }); });
    };
    // Navigation côté client : la page change sans recharger, le menu doit se
    // refermer quand on suit un de ses liens (même règle que l'en-tête).
    const suivi = (e: MouseEvent) => {
      if (e.target instanceof Element && e.target.closest("details a[href]")) ouverts().forEach((d) => { d.open = false; });
    };
    document.addEventListener("pointerdown", dehors, true);
    document.addEventListener("focusin", dehors);
    document.addEventListener("keydown", echap);
    nav.addEventListener("click", suivi);
    return () => {
      document.removeEventListener("pointerdown", dehors, true);
      document.removeEventListener("focusin", dehors);
      document.removeEventListener("keydown", echap);
      nav.removeEventListener("click", suivi);
    };
  }, []);

  const actif = (href: string) => entreeActive(chemin, href);
  const panier = articlesPanier !== null && articlesPanier > 0 ? articlesPanier : null;

  return (
    <nav ref={ref} aria-label={libelles.nav} className="barre-nav md:hidden">
      <ul className="barre-nav-liste">
        <li>
          <Link href="/" aria-current={actif("/") ? "page" : undefined} className="barre-nav-lien">
            <Icone taille={24}><path d="M4 11.5 12 5l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5h-5v5H5a1 1 0 0 1-1-1z" /></Icone>
            <span className="barre-nav-libelle">{libelles.accueil}</span>
          </Link>
        </li>
        <li>
          <Link href="/categories" aria-current={actif("/categories") ? "page" : undefined} className="barre-nav-lien">
            <Icone taille={24}>
              <rect x="4" y="4" width="7" height="7" rx="1" />
              <rect x="13" y="4" width="7" height="7" rx="1" />
              <rect x="4" y="13" width="7" height="7" rx="1" />
              <rect x="13" y="13" width="7" height="7" rx="1" />
            </Icone>
            <span className="barre-nav-libelle">{libelles.rayons}</span>
          </Link>
        </li>
        <li>
          <Link
            href="/panier"
            aria-current={actif("/panier") ? "page" : undefined}
            className="barre-nav-lien relative"
          >
            <Icone taille={24}>
              <path d="M3 4h2l2.4 10.4a2 2 0 002 1.6h7.2a2 2 0 002-1.6L20 7H6" />
              <circle cx="10" cy="19" r="1.4" />
              <circle cx="17" cy="19" r="1.4" />
            </Icone>
            <span className="barre-nav-libelle">{libelles.panier}</span>
            {panier !== null && <span className="barre-nav-compteur numeric">{panier}</span>}
          </Link>
        </li>
        <li>{compte}</li>
      </ul>
    </nav>
  );
}
