import Link from "next/link";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { CollectionToggle } from "@/components/collection-toggle";
import { ProductCard } from "@/components/product-card";
import { createClient } from "@/lib/supabase/server";
import { getPublishedProducts, isSupabaseConfigured } from "@/lib/products";
import { COLLECTIONS, type CollectionKind } from "@/lib/collections";
import { purchasePage } from "@/lib/purchase-center";
import { getLang } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";

export async function CollectionPage({ kind, pageParam }: { kind: CollectionKind; pageParam: unknown }) {
  const lang = await getLang();
  const config = COLLECTIONS[kind];
  const page = purchasePage(pageParam);
  const title = t(lang, kind === "favorites" ? "collections.favorites" : "collections.shops");
  const shell = (children: React.ReactNode) => <div className="bg-grain min-h-dvh"><SiteNav/><main id="main" className="mx-auto max-w-6xl px-5 py-14">
    <h1 className="text-3xl font-extrabold">{title}</h1>
    <p className="mt-3 text-sm text-mist">{t(lang, kind === "favorites" ? "collections.favorites.hint" : "collections.shops.hint")}</p>
    <nav className="my-6 flex gap-4" aria-label={t(lang, "collections.title")}>
      <Link href="/favoris" aria-current={kind === "favorites" ? "page" : undefined} className="inline-flex min-h-11 items-center underline">{t(lang, "collections.favorites")}</Link>
      <Link href="/boutiques-suivies" aria-current={kind === "shops" ? "page" : undefined} className="inline-flex min-h-11 items-center underline">{t(lang, "collections.shops")}</Link>
    </nav>{children}</main><SiteFooter/></div>;
  if (!isSupabaseConfigured()) return shell(<p>{t(lang, "collections.error")}</p>);
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return shell(<Link href={`/connexion?next=${encodeURIComponent(config.href)}`} className="inline-flex min-h-11 items-center rounded-xl bg-brand px-5 text-on-brand">{t(lang, "nav.login")}</Link>);
  const { data, error } = await client.from(config.table).select(`${config.column},created_at`).eq("user_id", user.id)
    .order("created_at", { ascending: false }).order(config.column).range((page - 1) * 20, page * 20);
  if (error) return shell(<p role="alert">{t(lang, "collections.error")}</p>);
  const rows = (data ?? []) as unknown as Record<string, string>[];
  const ids = rows.slice(0, 20).map(row => row[config.column]);
  const products = kind === "favorites" && ids.length ? await getPublishedProducts({ productIds: ids }) : [];
  const shops = kind === "shops" ? await Promise.all(ids.map(async id => {
    const { data, error } = await client.rpc("zabelie_boutik_public", { p_id: id, p_slug: null });
    return { id, data: error ? null : data as { display_name: string; bio: string | null } | null };
  })) : [];
  return shell(<>
    {ids.length === 0 ? <div className="rounded-2xl border border-line p-6"><p>{t(lang, "collections.empty")}</p><Link href="/catalogue" className="mt-3 inline-flex min-h-11 items-center underline">{t(lang, "product.back")}</Link></div> :
      <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{ids.map(id => {
        const product = products.find(p => p.id === id);
        const shop = shops.find(s => s.id === id)?.data;
        return <li key={id} className="flex flex-col gap-3 rounded-2xl border border-line p-4">
          {product ? <ProductCard product={product} labels={{ kindFile: t(lang, "card.kind.file"), kindService: t(lang, "card.kind.service"), kindPhysical: t(lang, "card.kind.physical"), by: t(lang, "product.by"), sales: t(lang, "product.sales"), salesOne: t(lang, "product.sales"), lang }}/>
            : shop ? <div><h2 className="text-lg font-semibold">{shop.display_name}</h2>{shop.bio && <p className="mt-2 line-clamp-3 text-sm text-mist">{shop.bio}</p>}<Link className="mt-3 inline-flex min-h-11 items-center underline" href={`/createur/${id}`}>{t(lang, "collections.shop.open")}</Link></div>
            : <p className="text-sm text-mist">{t(lang, "collections.unavailable")}</p>}
          <div className="mt-auto"><CollectionToggle id={id} kind={kind} initial authenticated labels={{ add: t(lang, kind === "favorites" ? "collections.favorite.add" : "collections.shop.add"), remove: t(lang, kind === "favorites" ? "collections.favorite.remove" : "collections.shop.remove"), error: t(lang, "collections.error") }}/></div>
        </li>;
      })}</ul>}
    <nav className="mt-6 flex justify-between gap-4" aria-label={t(lang, "purchases.pages")}>
      {page > 1 ? <Link className="inline-flex min-h-11 items-center underline" href={`${config.href}?page=${page-1}`}>{t(lang, "purchases.previous")}</Link> : <span/>}
      {rows.length > 20 && <Link className="inline-flex min-h-11 items-center underline" href={`${config.href}?page=${page+1}`}>{t(lang, "purchases.next")}</Link>}
    </nav>
  </>);
}
