import { SiteNav } from "@/components/site-nav";
import { SkeletonBlock, SkeletonPage } from "@/components/skeleton";

/** Fiche produit en attente : deux colonnes comme la vraie — image 4/3 à
 *  gauche, titre / prix / bouton à droite. */
export default function Loading() {
  return (
    <SkeletonPage>
      <SiteNav />
      <section className="mx-auto grid max-w-6xl gap-10 px-5 pb-16 pt-12 lg:grid-cols-2">
        <SkeletonBlock className="aspect-[4/3] w-full rounded-3xl" />
        <div>
          <SkeletonBlock className="h-3 w-24" />
          <SkeletonBlock className="mt-3 h-8 w-5/6" />
          <SkeletonBlock className="mt-2 h-8 w-2/3" />
          <SkeletonBlock className="mt-6 h-4 w-full" />
          <SkeletonBlock className="mt-2 h-4 w-11/12" />
          <SkeletonBlock className="mt-2 h-4 w-3/4" />
          <SkeletonBlock className="mt-8 h-9 w-32" />
          <SkeletonBlock className="mt-4 h-12 w-full max-w-sm rounded-xl" />
        </div>
      </section>
    </SkeletonPage>
  );
}
