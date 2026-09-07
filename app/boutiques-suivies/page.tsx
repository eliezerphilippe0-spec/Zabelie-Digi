import { CollectionPage } from "@/components/collection-page";
export const dynamic = "force-dynamic";
export const metadata = { title: "Boutiques suivies — Zabelie", robots: { index: false, follow: false } };
export default async function Page({ searchParams }: { searchParams: Promise<{ page?: string | string[] }> }) {
  return <CollectionPage kind="shops" pageParam={(await searchParams).page} />;
}
