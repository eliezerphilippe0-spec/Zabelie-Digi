import { SiteNav } from "@/components/site-nav";
import { SkeletonBlock, SkeletonGrid, SkeletonPage } from "@/components/skeleton";

/** Accueil en attente : la barre reste réelle, le hero et le premier rail
 *  prennent la forme du contenu. */
export default function Loading() {
  return (
    <SkeletonPage>
      <SiteNav />
      <section className="mx-auto max-w-6xl px-5 py-12">
        <SkeletonBlock className="mx-auto h-8 w-3/4 max-w-xl" />
        <SkeletonBlock className="mx-auto mt-4 h-4 w-1/2 max-w-md" />
        <SkeletonBlock className="mx-auto mt-8 h-11 w-48 rounded-xl" />
      </section>
      <section className="mx-auto max-w-6xl px-5 py-8">
        <SkeletonBlock className="h-7 w-48" />
        <div className="mt-6">
          <SkeletonGrid n={3} />
        </div>
      </section>
    </SkeletonPage>
  );
}
