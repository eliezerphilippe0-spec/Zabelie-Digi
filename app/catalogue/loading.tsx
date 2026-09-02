import { SiteNav } from "@/components/site-nav";
import { SkeletonBlock, SkeletonGrid, SkeletonPage } from "@/components/skeleton";

/** Catalogue en attente : titre, barre de recherche, six cartes. */
export default function Loading() {
  return (
    <SkeletonPage>
      <SiteNav />
      <section className="mx-auto max-w-6xl px-5 pb-10 pt-16">
        <SkeletonBlock className="h-9 w-64" />
        <SkeletonBlock className="mt-6 h-11 w-full max-w-xl rounded-xl" />
      </section>
      <section className="mx-auto max-w-6xl px-5 pb-16">
        <SkeletonGrid n={6} />
      </section>
    </SkeletonPage>
  );
}
