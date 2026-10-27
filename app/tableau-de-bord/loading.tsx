import { SiteNav } from "@/components/site-nav";
import { SkeletonBlock, SkeletonPage } from "@/components/skeleton";

/**
 * Tableau vendeur en attente — la forme de SA page (audit du système de design,
 * 2026-10-27, m6). Sans ce fichier, `/tableau-de-bord` retombait sur
 * `app/loading.tsx` : le hero et la grille de produits de l'ACCUEIL acheteur,
 * dessinés une seconde avant un tableau de bord vendeur.
 *
 * Le cadre est celui de `VendeurShell` (même classe de grille, croisée par
 * `tests/squelettes-pages.test.ts`) : onglets défilants sur téléphone, menu en
 * colonne sur ordinateur. Puis l'accueil vendeur (docs/73) : salutation et
 * lien boutique, actions rapides, argent, ventes récentes. Les rubriques
 * (`/tableau-de-bord/clients`, `…/compte`…) partagent ce cadre et attendent
 * derrière le même squelette.
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
      <div className="mx-auto max-w-6xl px-5 py-6 lg:grid lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-10 lg:py-8">
        <div className="-mx-5 flex gap-2 overflow-hidden px-5 pb-3 lg:mx-0 lg:flex-col lg:gap-1 lg:px-0 lg:pb-0">
          {Array.from({ length: 8 }, (_, i) => (
            <Pastille key={i} className="h-11 w-28 lg:w-full lg:rounded-xl" />
          ))}
        </div>

        <div className="min-w-0">
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:justify-between">
            <div className="w-full min-w-0 sm:flex-1">
              <SkeletonBlock className="h-8 w-56 sm:h-9" />
              <SkeletonBlock className="mt-3 h-4 w-full max-w-xl" />
              <SkeletonBlock className="mt-2 h-4 w-2/3 max-w-md" />
            </div>
            <SkeletonBlock className="h-11 w-40 shrink-0 rounded-xl" />
          </div>

          <SkeletonBlock className="mt-6 h-4 w-32" />
          <div className="mt-3 flex flex-wrap gap-2">
            {Array.from({ length: 4 }, (_, i) => (
              <Pastille key={i} className="h-11 w-32" />
            ))}
          </div>

          <div className="mt-8">
            <SkeletonBlock className="h-6 w-40" />
            <div className="mt-3 rounded-2xl border border-line bg-surface-maroon/70 p-6">
              <SkeletonBlock className="h-3 w-24" />
              <SkeletonBlock className="mt-2 h-10 w-48 sm:h-12" />
              <SkeletonBlock className="mt-2 h-3 w-32" />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
              {Array.from({ length: 4 }, (_, i) => (
                <div key={i} className="rounded-2xl border border-line bg-surface-maroon/40 p-4">
                  <SkeletonBlock className="h-3 w-16" />
                  <SkeletonBlock className="mt-2 h-6 w-20" />
                </div>
              ))}
            </div>
          </div>

          <div className="mt-10">
            <SkeletonBlock className="h-6 w-44" />
            <div className="mt-4 space-y-2">
              {Array.from({ length: 3 }, (_, i) => (
                <div
                  key={i}
                  className="grid grid-cols-[1fr_auto] items-center gap-4 rounded-xl border border-line bg-surface/60 px-4 py-3"
                >
                  <div className="min-w-0">
                    <SkeletonBlock className="h-4 w-3/4" />
                    <SkeletonBlock className="mt-1.5 h-3 w-1/3" />
                  </div>
                  <SkeletonBlock className="h-4 w-16" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </SkeletonPage>
  );
}
