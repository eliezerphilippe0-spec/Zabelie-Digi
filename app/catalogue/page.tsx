import Link from "next/link";
import { SiteNav } from "@/components/site-nav";
import { PRODUCT_CATEGORIES } from "@/lib/product-categories";
import { SiteFooter } from "@/components/site-footer";
import { ProductCard } from "@/components/product-card";
import { getPublishedProductsPage } from "@/lib/products";
import { getLang } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Catalogue — Zabelie",
};

// BL-105 : mêmes libellés que la publication (source unique, lib/product-categories).
const CATEGORIES = ["Tout", ...PRODUCT_CATEGORIES];

export default async function CataloguePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; cat?: string; page?: string }>;
}) {
  const { q, cat, page: pageRaw } = await searchParams;
  const activeCat = cat ?? "Tout";
  const page = Math.max(1, Number.parseInt(pageRaw ?? "1", 10) || 1);
  const [{ items: products, hasMore }, lang] = await Promise.all([
    getPublishedProductsPage({ q, category: activeCat, page }),
    getLang(),
  ]);

  // BL-134 (FRONT-19) : pagination par lien GET, 0 JS — préserve q/cat, change page.
  const hrefFor = (opts: { cat?: string; page?: number }) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    const c = opts.cat ?? activeCat;
    if (c !== "Tout") params.set("cat", c);
    const p = opts.page ?? 1;
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return qs ? `/catalogue?${qs}` : "/catalogue";
  };
  const catHref = (c: string) => hrefFor({ cat: c, page: 1 });

  return (
    <div className="bg-grain min-h-screen">
      <SiteNav />

      <section className="mx-auto max-w-6xl px-5 pb-10 pt-16">
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
          {t(lang, "catalog.title")}
        </h1>
        <p className="mt-2 text-sm text-mist">
          {products.length} {t(lang, "catalog.results")}
          {q ? ` ${t(lang, "catalog.for")} « ${q} »` : ""}
          {activeCat !== "Tout" ? ` · ${activeCat}` : ""}.
        </p>

        {/* Recherche (GET, fonctionne sans JS) */}
        <form action="/catalogue" className="mt-6 flex gap-2">
          {activeCat !== "Tout" && (
            <input type="hidden" name="cat" value={activeCat} />
          )}
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder={t(lang, "catalog.search.ph")}
            className="min-w-0 flex-1 rounded-xl border border-line bg-ink/40 px-4 py-3 text-sm outline-none focus:border-violet"
          />
          <button
            type="submit"
            className="rounded-xl bg-cloud px-5 py-3 text-sm font-semibold text-ink transition hover:opacity-90"
          >
            {t(lang, "catalog.search.btn")}
          </button>
        </form>

        {/* Filtres catégories */}
        <div className="mt-4 flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <Link
              key={c}
              href={catHref(c)}
              className={`rounded-full border px-4 py-1.5 text-sm transition ${
                c === activeCat
                  ? "border-transparent bg-cloud text-ink"
                  : "border-line text-mist hover:border-violet/50 hover:text-cloud"
              }`}
            >
              {c}
            </Link>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 pb-16">
        {products.length === 0 ? (
          <div className="rounded-2xl border border-line bg-surface/40 p-10 text-center text-sm text-mist">
            {t(lang, "catalog.none")}{" "}
            <Link href="/catalogue" className="text-cloud underline">
              {t(lang, "catalog.reset")}
            </Link>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {products.map((p) => (
                <ProductCard
                  key={p.slug}
                  product={p}
                  labels={{
                    kindFile: t(lang, "card.kind.file"),
                    kindService: t(lang, "card.kind.service"),
                    by: t(lang, "product.by"),
                    sales: t(lang, "product.sales"),
                  }}
                />
              ))}
            </div>
            {hasMore && (
              <div className="mt-10 text-center">
                <Link
                  href={hrefFor({ page: page + 1 })}
                  className="inline-block rounded-xl border border-line bg-surface/60 px-6 py-3 text-sm font-semibold text-cloud transition hover:border-violet/50"
                >
                  {t(lang, "catalog.more")}
                </Link>
              </div>
            )}
          </>
        )}
      </section>

      <SiteFooter />
    </div>
  );
}
