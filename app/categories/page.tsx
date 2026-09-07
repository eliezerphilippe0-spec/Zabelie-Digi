import Link from "next/link";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { DepartmentIcon } from "@/components/department-icons";
import { getMenuRayons } from "@/lib/taxonomy";
import { filterCategoryDirectory } from "@/lib/category-directory";
import { getLang } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const [lang, { q }] = await Promise.all([getLang(), searchParams]);
  return {
    title: t(lang, "directory.title"),
    description: t(lang, "directory.intro"),
    alternates: { canonical: "/categories" },
    robots: typeof q === "string" && q.trim() ? { index: false, follow: true } : undefined,
  };
}

export default async function CategoriesPage({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const [lang, { q: rawQuery }] = await Promise.all([getLang(), searchParams]);
  const q = typeof rawQuery === "string" ? rawQuery.slice(0, 120) : "";
  const all = await getMenuRayons(lang);
  const rows = filterCategoryDirectory(all, q);
  return <div className="bg-grain min-h-dvh">
    <SiteNav activeHref="/categories" />
    <main id="main" className="mx-auto max-w-6xl px-5 py-8">
      <nav aria-label={t(lang, "nav.breadcrumb")} className="mb-5 flex flex-wrap items-center gap-2 text-sm text-mist">
        <Link href="/" className="underline underline-offset-4">{t(lang, "nav.home")}</Link>
        <span aria-hidden="true">/</span><span aria-current="page">{t(lang, "directory.title")}</span>
      </nav>
      <h1 className="text-3xl font-extrabold sm:text-4xl">{t(lang, "directory.title")}</h1>
      <p className="mt-3 max-w-2xl text-mist">{t(lang, "directory.intro")}</p>
      <form action="/categories" className="mt-6 flex max-w-2xl gap-2">
        <input name="q" defaultValue={q} aria-label={t(lang, "directory.search")} placeholder={t(lang, "directory.search")} className="min-h-11 min-w-0 flex-1 rounded-xl border border-line bg-ink px-4 text-sm" />
        <button type="submit" className="min-h-11 rounded-xl bg-brand px-5 font-semibold text-on-brand">{t(lang, "catalog.search.btn")}</button>
      </form>
      {q && <Link href="/categories" className="mt-2 inline-flex min-h-11 items-center text-sm underline underline-offset-4">{t(lang, "directory.reset")}</Link>}
      {rows.length > 0 ? <div className="mt-8 grid items-start gap-4 lg:grid-cols-2">
        {rows.map((department) => <section key={department.slug} className="rounded-2xl border border-line bg-ink p-5" aria-labelledby={`department-${department.slug}`}>
          <div className="flex items-start gap-3">
            <DepartmentIcon slug={department.slug} className="mt-1 h-6 w-6 flex-none" />
            <div>
              <h2 id={`department-${department.slug}`} className="text-lg font-bold"><Link href={department.href} className="inline-flex min-h-11 items-center hover:underline">{department.label}</Link></h2>
              <p className="text-xs text-mist">{t(lang, department.vide ? "directory.empty" : "directory.offers")}</p>
            </div>
          </div>
          <ul className="mt-4 divide-y divide-line">
            {department.enfants.map((category) => <li key={category.slug}>
              {category.enfants.length ? <details open={Boolean(q)} className="group">
                <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-3 py-3 text-sm font-semibold">
                  {category.label}<span aria-hidden="true" className="text-mist transition group-open:rotate-45">+</span>
                </summary>
                <Link href={category.href} className="inline-flex min-h-11 items-center text-sm underline underline-offset-4">{t(lang, "directory.view")}</Link>
                <ul className="mb-3 border-l border-line pl-4">
                  {category.enfants.map((leaf) => <li key={leaf.slug}><Link href={leaf.href} className="flex min-h-11 items-center py-2 text-sm text-mist hover:text-cloud hover:underline">{leaf.label}</Link></li>)}
                </ul>
              </details> : <Link href={category.href} className="flex min-h-11 items-center py-3 text-sm font-semibold hover:underline">{category.label}</Link>}
            </li>)}
          </ul>
        </section>)}
      </div> : <p className="mt-8 rounded-2xl border border-line p-6 text-mist">{t(lang, all.length ? "directory.noMatch" : "directory.unavailable")}</p>}
    </main>
    <SiteFooter />
  </div>;
}
