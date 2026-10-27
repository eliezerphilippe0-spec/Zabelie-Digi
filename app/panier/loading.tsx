import { SiteNav } from "@/components/site-nav";
import { SkeletonBlock, SkeletonPage } from "@/components/skeleton";

/** Panier en attente : la forme du PANIER, pas celle de l'accueil.
 *
 *  Sans ce fichier, `/panier` retombait sur `app/loading.tsx`, qui dessine le
 *  hero et la grille de cartes de l'accueil : l'acheteur qui venait de toucher
 *  l'icône du panier voyait une autre page arriver, puis la sienne la
 *  remplacer. Ici, même coquille que `page.tsx` (`max-w-3xl`, `px-5 py-16`) :
 *  le titre, une boutique de lignes (vignette carrée de 64 px, titre, prix,
 *  deux boutons), le total, le bouton de paiement. Aucun texte : un squelette
 *  ne se traduit pas (`components/skeleton.tsx`). */
export default function Loading() {
  return (
    <SkeletonPage>
      <SiteNav />
      <main id="main" className="mx-auto max-w-3xl px-5 py-16">
        <SkeletonBlock className="h-9 w-48" />
        <div className="mt-6 rounded-2xl border border-line bg-surface/40">
          <div className="flex min-h-11 items-center border-b border-line px-4">
            <SkeletonBlock className="h-4 w-32" />
          </div>
          <ul className="divide-y divide-line">
            {[0, 1, 2].map((i) => (
              <li key={i} className="flex gap-3 p-4">
                <SkeletonBlock className="h-16 w-16 flex-none" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                    <SkeletonBlock className="h-4 w-3/5" />
                    <SkeletonBlock className="h-4 w-20" />
                  </div>
                  <div className="mt-3 flex gap-3">
                    <SkeletonBlock className="h-11 w-36 rounded-xl" />
                    <SkeletonBlock className="h-11 w-24 rounded-xl" />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div className="mt-4 flex items-center justify-between rounded-2xl border border-line bg-surface/40 px-4 py-3">
          <SkeletonBlock className="h-4 w-16" />
          <SkeletonBlock className="h-7 w-28" />
        </div>
        <SkeletonBlock className="mt-6 h-11 w-full rounded-xl" />
      </main>
    </SkeletonPage>
  );
}
