import Link from "next/link";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { ProductCard } from "@/components/product-card";
import {
  getCatalogueCategories,
  getPublishedProductsPage,
  recordSearchMiss,
  searchFuzzyProductIds,
} from "@/lib/products";
import { sessionFingerprint } from "@/lib/search-demand";
import { headers } from "next/headers";
import { getCategoryFacets, productIdsInCategory } from "@/lib/taxonomy";
import { getLang } from "@/lib/i18n-server";
import { isPrefetch, logLanding } from "@/lib/metrics";
import { t } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Catalogue — Zabelie",
};

// Les puces viennent des produits RÉELLEMENT publiés, plus d'une liste en dur :
// celle-ci ne connaissait que les six libellés digitaux, donc aucune ne pouvait
// atteindre un produit physique — rangé sous son département (« Auto & Moto »).
// Il n'apparaissait que sous « Tout » et disparaissait dès qu'on filtrait.

export default async function CataloguePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; cat?: string; sous?: string; page?: string }>;
}) {
  const { q, cat, sous, page: pageRaw } = await searchParams;
  const activeCat = cat ?? "Tout";
  const page = Math.max(1, Number.parseInt(pageRaw ?? "1", 10) || 1);
  // Le second niveau se résout AVANT la requête catalogue : il la restreint.
  const productIds = sous ? await productIdsInCategory(sous) : null;
  const [{ items: products, hasMore }, lang, categories] = await Promise.all([
    getPublishedProductsPage({
      q,
      category: activeCat,
      page,
      productIds: productIds ?? undefined,
    }),
    getLang(),
    getCatalogueCategories(),
  ]);
  // Rayons fins du département actif. Vide hors département, et vide tant
  // qu'aucun produit publié n'y est rangé (V-13 : jamais un rayon désert).
  const facettes =
    activeCat !== "Tout" ? await getCategoryFacets(activeCat, lang) : [];

  // ── Couches 2 et 3 du capteur de demande (lot S) ─────────────────────────
  // Ordre voulu : la recherche littérale d'abord, le rattrapage ensuite, le
  // journal en dernier. Un terme n'est consigné comme MANQUANT que si les
  // deux couches ont échoué — sinon on irait recruter un vendeur pour un
  // produit qu'on a déjà, mal orthographié.
  let approchants: typeof products = [];
  let manque = false;
  if (q && products.length === 0) {
    const ids = await searchFuzzyProductIds(q);
    if (ids.length > 0) {
      approchants = (
        await getPublishedProductsPage({ productIds: ids, page: 1 })
      ).items;
    }
    if (approchants.length === 0) {
      manque = true;
      // Sans poivre serveur, `sessionFingerprint` rend `null` et on
      // N'ENREGISTRE PAS : un journal ré-identifiable serait pire que pas de
      // journal du tout. L'écran zéro-résultat, lui, s'affiche quand même.
      const empreinte = sessionFingerprint(await headers());
      if (empreinte) {
        // Best-effort et non bloquant : le capteur ne doit jamais faire
        // échouer la page qu'il observe.
        await recordSearchMiss({
          q,
          department: activeCat !== "Tout" ? activeCat : null,
          sessionHash: empreinte,
        });
      }
    }
  }
  // Mesure (journal Vercel, zéro PII — lib/metrics). Côté SERVEUR : la page
  // qui reçoit la navigation voit l'événement sans un octet de JS client. Le
  // garde préchargement évite de compter chaque survol de lien comme un clic.
  if (!(await isPrefetch())) {
    if (q) logLanding("search_submitted");
    if (activeCat !== "Tout") logLanding("category_clicked", { cat: activeCat });
    if (manque) logLanding("demand_sensor_submitted");
  }

  const CATEGORIES = ["Tout", ...categories];
  // Filtre en cours = recherche OU catégorie. Sert à distinguer « rien ne
  // correspond » de « le catalogue est vide », qui appellent des réponses
  // opposées : reformuler d'un côté, publier de l'autre.
  const filtre = Boolean(q) || activeCat !== "Tout";

  // BL-134 (FRONT-19) : pagination par lien GET, 0 JS — préserve q/cat, change page.
  const hrefFor = (opts: { cat?: string; sous?: string | null; page?: number }) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    const c = opts.cat ?? activeCat;
    if (c !== "Tout") params.set("cat", c);
    // Changer de département invalide le rayon fin : `sous` appartient au
    // département courant, le garder afficherait un filtre impossible.
    const s2 = opts.sous === null ? undefined : (opts.sous ?? (opts.cat ? undefined : sous));
    if (s2) params.set("sous", s2);
    const p = opts.page ?? 1;
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return qs ? `/catalogue?${qs}` : "/catalogue";
  };
  const cardLabels = {
    kindFile: t(lang, "card.kind.file"),
    kindService: t(lang, "card.kind.service"),
    kindPhysical: t(lang, "card.kind.physical"),
    by: t(lang, "product.by"),
    sales: t(lang, "product.sales"),
  };
  const catHref = (c: string) => hrefFor({ cat: c, sous: null, page: 1 });
  const sousHref = (slug: string | null) => hrefFor({ sous: slug ?? undefined, page: 1 });

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
          {activeCat !== "Tout" ? ` · ${activeCat}` : ""}
          {sous ? ` · ${facettes.find((f) => f.slug === sous)?.label ?? sous}` : ""}.
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

        {/* Filtres catégories — masqués tant qu'il n'y a rien à filtrer :
            une seule puce « Tout » n'est pas un filtre, c'est du décor. */}
        {categories.length > 0 && (
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
        )}

        {/* Second niveau : les rayons du département actif. N'apparaît que
            s'il y a de quoi choisir — un seul rayon n'est pas une navigation,
            et zéro rayon ne doit rien afficher du tout (V-13). */}
        {facettes.length > 1 && (
          <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">
            <Link
              href={sousHref(null)}
              className={`rounded-full px-3 py-1 text-xs transition ${
                !sous ? "bg-cloud text-ink" : "text-mist hover:text-cloud"
              }`}
            >
              {t(lang, "catalog.allShelves")}
            </Link>
            {facettes.map((f) => (
              <Link
                key={f.slug}
                href={sousHref(f.slug)}
                className={`rounded-full px-3 py-1 text-xs transition ${
                  f.slug === sous ? "bg-cloud text-ink" : "text-mist hover:text-cloud"
                }`}
              >
                {f.label}{" "}
                <span className={f.slug === sous ? "text-ink/60" : "text-mist/60"}>
                  {f.count}
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="mx-auto max-w-6xl px-5 pb-16">
        {products.length === 0 && approchants.length > 0 ? (
          /* Couche 2 : rien d'exact, mais la similarité a rattrapé. On le DIT
             — présenter un approchant comme un résultat exact fait douter de
             tout le catalogue. */
          <>
            <p className="mb-4 rounded-xl border border-line bg-surface/40 px-4 py-3 text-sm text-mist">
              {t(lang, "catalog.fuzzy")}
            </p>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {approchants.map((p) => (
                <ProductCard key={p.slug} product={p} labels={cardLabels} />
              ))}
            </div>
          </>
        ) : products.length === 0 ? (
          manque ? (
            /* L'écran qui EST le produit du lot S. Trois éléments, dans cet
               ordre : ce qui a été cherché, où regarder à côté, et le seul
               geste qui change quelque chose — dire qu'on connaît un vendeur.
               L'acheteur déçu devient le canal de recrutement. */
            <div className="rounded-2xl border border-line bg-surface/40 p-8 text-center">
              <p className="text-base font-semibold text-cloud">
                {t(lang, "catalog.miss.title")} « {q} »
              </p>
              <p className="mx-auto mt-2 max-w-md text-sm text-mist">
                {t(lang, "catalog.miss.body")}
              </p>

              {facettes.length > 0 && (
                <div className="mt-6">
                  <p className="text-xs uppercase tracking-wide text-mist">
                    {t(lang, "catalog.miss.shelves")}
                  </p>
                  <div className="mt-2 flex flex-wrap justify-center gap-2">
                    {facettes.slice(0, 6).map((f) => (
                      <Link
                        key={f.slug}
                        href={`/catalogue?cat=${encodeURIComponent(activeCat)}&sous=${f.slug}`}
                        className="rounded-full border border-line px-3 py-1 text-xs text-mist hover:text-cloud"
                      >
                        {f.label} {f.count}
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              <p className="mt-6 text-sm text-cloud">{t(lang, "catalog.miss.know")}</p>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(
                  `Zabelie: ${q}`
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-block rounded-xl bg-brand px-6 py-3 text-sm font-semibold text-ink"
              >
                {t(lang, "catalog.miss.share")}
              </a>
            </div>
          ) : filtre && !q ? (
            /* Rayon filtré, AUCUNE recherche : c'est l'atterrissage des cartes
               de la grille d'accueil et des liens du menu. « Aucun résultat +
               réinitialiser » n'aurait aucun sens — il n'y a rien à
               reformuler. On dit la vérité utile : le rayon est ouvert, les
               premiers vendeurs s'installent, la place est libre. Aucun état
               vide muet (landing v2). */
            <div className="rounded-2xl border border-line bg-surface/40 p-10 text-center">
              <p className="text-base font-semibold text-cloud">
                {t(lang, "catalog.cat0.t")} — {sous ? facettes.find((f) => f.slug === sous)?.label ?? activeCat : activeCat}
              </p>
              <p className="mx-auto mt-2 max-w-md text-sm text-mist">
                {t(lang, "catalog.cat0.b")}
              </p>
              <Link
                href="/vendre"
                className="mt-5 inline-block rounded-xl bg-brand px-6 py-3 text-sm font-semibold text-ink"
              >
                {t(lang, "catalog.empty.cta")}
              </Link>
              <p className="mt-4 text-sm">
                <Link href="/catalogue" className="text-mist underline hover:text-cloud">
                  {t(lang, "catalog.reset")}
                </Link>
              </p>
            </div>
          ) : filtre ? (
            <div className="rounded-2xl border border-line bg-surface/40 p-10 text-center text-sm text-mist">
              {t(lang, "catalog.none")}{" "}
              <Link href="/catalogue" className="text-cloud underline">
                {t(lang, "catalog.reset")}
              </Link>
            </div>
          ) : (
            /* Catalogue vide — V-13 : l'état vide devait être utilisable avant
               qu'on touche à la barre de catégories. Un « aucun résultat »
               suivi d'un lien « réinitialiser » n'a aucun sens ici : il n'y a
               rien à réinitialiser, et la seule action utile est de publier. */
            <div className="rounded-2xl border border-line bg-surface/40 p-10 text-center">
              <p className="text-base font-semibold text-cloud">
                {t(lang, "catalog.empty.title")}
              </p>
              <p className="mx-auto mt-2 max-w-md text-sm text-mist">
                {t(lang, "catalog.empty.body")}
              </p>
              <Link
                href="/vendre"
                className="mt-5 inline-block rounded-xl bg-brand px-6 py-3 text-sm font-semibold text-ink"
              >
                {t(lang, "catalog.empty.cta")}
              </Link>
            </div>
          )
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
                    kindPhysical: t(lang, "card.kind.physical"),
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
