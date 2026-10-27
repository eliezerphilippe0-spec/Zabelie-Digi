import { SiteNav } from "@/components/site-nav";
import { SkeletonBlock, SkeletonPage } from "@/components/skeleton";
import { PURCHASE_VIEWS } from "@/lib/purchase-center";

/**
 * Mes achats en attente — la forme de SA page (audit du système de design,
 * 2026-10-27, m6). Sans ce fichier, `/mes-achats` retombait sur
 * `app/loading.tsx` : le hero et la grille de l'ACCUEIL, juste après un
 * paiement, à l'endroit où l'acheteur vient vérifier sa commande.
 *
 * Même conteneur que la page (`Shell` de `app/mes-achats/page.tsx`, croisé par
 * `tests/squelettes-pages.test.ts`) : titre, phrase d'introduction, une
 * pastille par vue (`PURCHASE_VIEWS` — la même liste que la page, pas un
 * nombre recopié), puis des cartes de commande : référence et statut, titre
 * et montant, action.
 *
 * Aucun texte (un squelette ne se traduit pas) ; `aria-busy` est porté par
 * `SkeletonPage`.
 */

/** Pastille : `SkeletonBlock` porte `rounded-lg`, qui l'emporte sur `rounded-full`
 *  dans l'ordre des utilitaires — l'arrondi est donc posé par un cadre autour. */
function Pastille({ className }: { className: string }) {
  return (
    <div className={`shrink-0 overflow-hidden rounded-full ${className}`}>
      <SkeletonBlock className="h-full w-full rounded-none" />
    </div>
  );
}

export default function Loading() {
  return (
    <SkeletonPage>
      <SiteNav />
      <div className="mx-auto max-w-5xl px-5 py-16">
        <SkeletonBlock className="h-9 w-48" />
        <SkeletonBlock className="mt-3 h-4 w-full max-w-2xl" />
        <SkeletonBlock className="mt-2 h-4 w-2/3 max-w-xl" />

        <div className="mt-8 flex flex-wrap gap-2">
          {PURCHASE_VIEWS.map((v) => (
            <Pastille key={v} className="h-11 w-28" />
          ))}
        </div>

        <div className="mt-6 space-y-4">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="rounded-2xl border border-line bg-surface/60 p-5">
              <div className="flex items-center justify-between gap-2 border-b border-line pb-3">
                <SkeletonBlock className="h-3 w-40" />
                <Pastille className="h-7 w-24" />
              </div>
              <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:justify-between">
                <div className="min-w-0 flex-1">
                  <SkeletonBlock className="h-5 w-3/5" />
                  <SkeletonBlock className="mt-2 h-4 w-24" />
                </div>
                <SkeletonBlock className="h-11 w-36 rounded-xl" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </SkeletonPage>
  );
}
