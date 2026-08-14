"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

/**
 * Barre de navigation admin avec badges de files.
 *
 * Un seul fetch au montage, puis revalidation DOUCE : au focus de l'onglet et
 * toutes les 90 s — jamais de polling agressif, le back-office vit longtemps
 * ouvert dans un onglet. Badge masqué à zéro (un « 0 » permanent est du
 * bruit) ; « 99+ » au-delà — un compteur à trois chiffres ne se lit plus, il
 * s'alerte.
 *
 * Les clés rendues ici sont EXACTEMENT celles de /api/admin/menu-counts —
 * croisement figé par tests/admin-menu-counts.test.ts (un compteur calculé
 * que personne n'affiche, ou un badge sans source, échoue la suite).
 */
type Counts = { produits: number; zelle: number; rechaj: number; litiges: number };

/** Entrées de navigation : libellé (admin = fr, convention existante), cible, clé de compteur. */
export const MENU_ADMIN: { label: string; href: string; cle: keyof Counts | null }[] = [
  { label: "Back-office", href: "/admin", cle: null },
  { label: "Produits", href: "/admin#produits", cle: "produits" },
  { label: "Zelle", href: "/admin#zelle", cle: "zelle" },
  { label: "Rechaj", href: "/admin#rechaj", cle: "rechaj" },
  { label: "Litiges", href: "/admin#commandes", cle: "litiges" },
  { label: "Remises", href: "/admin/livraisons", cle: null },
  { label: "Règlements", href: "/admin/paiements-vendeurs", cle: null },
  { label: "Géo", href: "/admin/geo", cle: null },
  { label: "Zones", href: "/admin/zones", cle: null },
];

export function MenuBadges({ actif }: { actif: string }) {
  const [counts, setCounts] = useState<Counts | null>(null);

  useEffect(() => {
    let vivant = true;
    const charge = async () => {
      try {
        const r = await fetch("/api/admin/menu-counts");
        if (!r.ok) return; // silencieux : le décor ne casse jamais la page
        const data = (await r.json()) as Counts;
        if (vivant) setCounts(data);
      } catch {
        /* hors ligne / transitoire : les badges gardent leur dernière valeur */
      }
    };
    charge();
    const minuterie = setInterval(charge, 90_000);
    const auFocus = () => document.visibilityState === "visible" && charge();
    document.addEventListener("visibilitychange", auFocus);
    return () => {
      vivant = false;
      clearInterval(minuterie);
      document.removeEventListener("visibilitychange", auFocus);
    };
  }, []);

  return (
    <nav aria-label="Navigation admin" className="flex flex-wrap items-center gap-1">
      {MENU_ADMIN.map((e) => {
        const n = e.cle && counts ? counts[e.cle] : 0;
        return (
          <Link
            key={e.href}
            href={e.href}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition ${
              actif === e.href
                ? "bg-cloud font-semibold text-ink"
                : "text-mist hover:bg-black/20 hover:text-cloud"
            }`}
          >
            {e.label}
            {n > 0 && (
              <span
                aria-label={`${n} en attente`}
                className="rounded-full bg-brand px-1.5 py-0.5 text-xs font-bold leading-none text-ink"
              >
                {n > 99 ? "99+" : n}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
