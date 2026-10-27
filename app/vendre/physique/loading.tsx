import { SiteNav } from "@/components/site-nav";
import { SkeletonBlock, SkeletonPage } from "@/components/skeleton";

/**
 * Formulaire « produit physique » en attente — la forme de SA page (audit du
 * système de design, 2026-10-27, relecture m10). Sans ce fichier, la page
 * attendait derrière le squelette de `app/vendre/loading.tsx` : la liste
 * « Produits » du vendeur, pour un écran qui est un formulaire.
 *
 * Même conteneur que la page (croisé par `tests/squelettes-pages.test.ts`) :
 * titre, phrase d'introduction et lien, encadré « préparer », puis des champs
 * (étiquette et zone de saisie) et le bouton d'envoi.
 *
 * Aucun texte (un squelette ne se traduit pas) ; `aria-busy` est porté par
 * `SkeletonPage`.
 */
export default function Loading() {
  return (
    <SkeletonPage>
      <SiteNav />
      <div className="mx-auto max-w-xl px-5 py-16">
        <SkeletonBlock className="h-9 w-3/4" />
        <SkeletonBlock className="mt-3 h-4 w-full" />
        <SkeletonBlock className="mt-4 h-4 w-40" />

        <div className="mt-6 rounded-2xl border border-line bg-surface/40 p-5">
          <SkeletonBlock className="h-5 w-48" />
          <SkeletonBlock className="mt-3 h-4 w-11/12" />
          <SkeletonBlock className="mt-2 h-4 w-4/5" />
          <SkeletonBlock className="mt-2 h-4 w-3/5" />
        </div>

        <div className="mt-8 space-y-5">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i}>
              <SkeletonBlock className="h-4 w-32" />
              <SkeletonBlock className="mt-2 h-11 w-full rounded-xl" />
            </div>
          ))}
          <SkeletonBlock className="h-12 w-full rounded-xl" />
        </div>
      </div>
    </SkeletonPage>
  );
}
