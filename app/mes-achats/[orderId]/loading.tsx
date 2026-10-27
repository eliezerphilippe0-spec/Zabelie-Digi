import { SiteNav } from "@/components/site-nav";
import { SkeletonBlock, SkeletonPage } from "@/components/skeleton";

/**
 * Un achat numérique en attente — la forme de SA page (audit du système de
 * design, 2026-10-27, relecture m10). Sans ce fichier, la page attendait
 * derrière le squelette de `app/mes-achats/loading.tsx` : la LISTE des
 * achats, pour un écran qui est un seul achat ouvert.
 *
 * Même conteneur que la page (croisé par `tests/squelettes-pages.test.ts`) :
 * lien de retour, en-tête de l'achat (mode, titre, version), licence, puis
 * les leçons ou fichiers.
 *
 * Aucun texte (un squelette ne se traduit pas) ; `aria-busy` est porté par
 * `SkeletonPage`.
 */
export default function Loading() {
  return (
    <SkeletonPage>
      <SiteNav />
      <div className="mx-auto max-w-5xl px-5 py-12">
        <SkeletonBlock className="mb-6 h-4 w-36" />
        <div className="border-b border-line pb-6">
          <SkeletonBlock className="h-4 w-24" />
          <SkeletonBlock className="mt-3 h-9 w-2/3" />
          <SkeletonBlock className="mt-3 h-4 w-40" />
        </div>

        <div className="mt-6 rounded-2xl border border-line p-5">
          <SkeletonBlock className="h-6 w-32" />
          <SkeletonBlock className="mt-3 h-4 w-full" />
          <SkeletonBlock className="mt-2 h-4 w-4/5" />
        </div>

        <div className="mt-5 space-y-4">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="rounded-2xl border border-line bg-surface p-5">
              <SkeletonBlock className="h-5 w-1/2" />
              <SkeletonBlock className="mt-3 h-4 w-full" />
              <SkeletonBlock className="mt-2 h-4 w-3/4" />
            </div>
          ))}
        </div>
      </div>
    </SkeletonPage>
  );
}
