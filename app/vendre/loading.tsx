import { SiteNav } from "@/components/site-nav";
import { SkeletonBlock, SkeletonPage } from "@/components/skeleton";

/**
 * « Produits » du vendeur en attente — la forme de SA page (audit du système de
 * design, 2026-10-27, m6). Sans ce fichier, `/vendre` retombait sur
 * `app/loading.tsx` : le hero et la grille de l'ACCUEIL acheteur.
 *
 * `/vendre` a deux visages : la page d'appel (visiteur) et la rubrique
 * « Produits » du tableau vendeur (vendeur connecté). Un squelette ne sait pas
 * lequel arrive sans interroger la session — un aller-retour réseau de plus,
 * sur 3G, pour dessiner une attente. Il prend donc la forme de la rubrique :
 * c'est le vendeur qui revient sur cette page, par le menu « Produits »,
 * quand le visiteur n'y passe qu'une fois. Même cadre que `VendeurShell`
 * (croisé par `tests/squelettes-pages.test.ts`), puis titre, commission,
 * choix du type de produit, filtres et liste.
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
          <SkeletonBlock className="h-8 w-40 lg:h-9" />
          <SkeletonBlock className="mt-2 h-4 w-2/3 max-w-md" />
          <SkeletonBlock className="mt-4 h-4 w-44" />

          <div className="mt-5 rounded-2xl border border-line bg-surface/40 p-5">
            <SkeletonBlock className="h-4 w-32" />
            <SkeletonBlock className="mt-2 h-9 w-24" />
            <SkeletonBlock className="mt-2 h-4 w-3/4" />
          </div>

          <div className="mt-8 rounded-2xl border border-line p-6">
            <SkeletonBlock className="h-6 w-48" />
            <SkeletonBlock className="mt-2 h-4 w-2/3" />
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {Array.from({ length: 3 }, (_, i) => (
                <SkeletonBlock key={i} className="h-20 w-full rounded-xl" />
              ))}
            </div>
          </div>

          <SkeletonBlock className="mt-10 h-4 w-32" />
          <div className="mt-3 flex gap-2 overflow-hidden">
            {Array.from({ length: 4 }, (_, i) => (
              <Pastille key={i} className="h-11 w-24" />
            ))}
          </div>
          <div className="mt-3 space-y-2">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="rounded-2xl border border-line bg-surface/60 p-5">
                <SkeletonBlock className="h-4 w-1/2" />
                <SkeletonBlock className="mt-2 h-3 w-1/4" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </SkeletonPage>
  );
}
