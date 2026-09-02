import { SiteNav } from "@/components/site-nav";
import { SkeletonBlock, SkeletonGrid, SkeletonPage } from "@/components/skeleton";

/** Boutique en attente : avatar, nom, bio, puis la grille. */
export default function Loading() {
  return (
    <SkeletonPage>
      <SiteNav />
      <section className="mx-auto max-w-6xl px-5 pb-10 pt-16">
        <div className="flex items-center gap-5">
          <SkeletonBlock className="h-20 w-20 rounded-2xl" />
          <div className="flex-1">
            <SkeletonBlock className="h-8 w-56" />
            <SkeletonBlock className="mt-3 h-4 w-36" />
          </div>
        </div>
        <SkeletonBlock className="mt-6 h-4 w-full max-w-2xl" />
        <SkeletonBlock className="mt-2 h-4 w-2/3 max-w-xl" />
      </section>
      <section className="mx-auto max-w-6xl px-5 pb-16">
        <SkeletonGrid n={3} />
      </section>
    </SkeletonPage>
  );
}
