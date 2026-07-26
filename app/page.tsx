import Link from "next/link";
import Image from "next/image";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { ProductCard } from "@/components/product-card";
import { PRODUCT_CATEGORIES } from "@/lib/product-categories";
import { getPublishedProducts, isSupabaseConfigured, type ProductView } from "@/lib/products";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatHTG } from "@/lib/sample-data";
import { getLang } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";
import type { ProductCardLabels } from "@/components/product-card";

export const dynamic = "force-dynamic";

/** Rangée de produits — masquée si vide (les sections vivent avec les données). */
function HomeRow({
  id,
  title,
  sub,
  more,
  items,
  cardLabels,
}: {
  id?: string;
  title: string;
  sub: string;
  more: string;
  items: ProductView[];
  cardLabels: ProductCardLabels;
}) {
  if (items.length === 0) return null;
  return (
    <section id={id} className="mx-auto max-w-6xl px-5 py-12">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h2>
          <p className="mt-2 text-sm text-mist">{sub}</p>
        </div>
        <Link
          href="/catalogue"
          className="hidden text-sm text-mist transition hover:text-cloud sm:block"
        >
          {more}
        </Link>
      </div>
      <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((p) => (
          <ProductCard key={p.slug} product={p} labels={cardLabels} />
        ))}
      </div>
    </section>
  );
}

/** Vendeurs avec au moins un code promo actif (section 8) — vide en mode démo. */
async function promoSellerIds(): Promise<Set<string>> {
  if (!isSupabaseConfigured()) return new Set();
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("zabelie_coupons")
      .select("seller_id")
      .eq("active", true)
      .or("expires_at.is.null,expires_at.gt.now()")
      .limit(200);
    return new Set((data ?? []).map((c) => c.seller_id));
  } catch {
    return new Set();
  }
}

export default async function HomePage() {
  const [products, lang, promoSellers] = await Promise.all([
    // Correctif audit : getPublishedProducts lève désormais en cas d'erreur
    // Supabase (BL-116, pour empêcher un repli silencieux sur le catalogue
    // vers des produits de démo inachetables) — mais l'accueil n'a pas cette
    // page d'erreur, il n'y a AUCUN app/error.tsx dans le projet. Un incident
    // transitoire faisait planter tout l'accueil. Ici, une liste vide est
    // sans risque : toutes les sections se masquent déjà si vides.
    getPublishedProducts().catch(() => []),
    getLang(),
    promoSellerIds(),
  ]);

  const cardLabels: ProductCardLabels = {
    kindFile: t(lang, "card.kind.file"),
    kindService: t(lang, "card.kind.service"),
    by: t(lang, "product.by"),
    sales: t(lang, "product.sales"),
  };

  // Dérivations : une seule requête catalogue alimente toutes les sections.
  const bySales = [...products].sort((a, b) => b.sales - a.sales);
  const featured = bySales[0] ?? null; // « Pwodui semèn nan »
  const trending = bySales.slice(0, 6);
  const newest = products.slice(0, 3); // requête déjà triée par date desc
  const services = bySales.filter((p) => p.kind === "service").slice(0, 3);
  const free = products.filter((p) => p.priceHTG === 0).slice(0, 3);
  const promo = bySales
    .filter((p) => p.creatorId && promoSellers.has(p.creatorId))
    .slice(0, 3);

  const categories = [...products.reduce((m, p) => {
    if (p.category) m.set(p.category, (m.get(p.category) ?? 0) + 1);
    return m;
  }, new Map<string, number>())].sort((a, b) => b[1] - a[1]).slice(0, 8);

  const sellerMap = new Map<string, { name: string; id: string | null; sales: number; rSum: number; rN: number }>();
  for (const p of products) {
    const s = sellerMap.get(p.creator) ?? { name: p.creator, id: p.creatorId, sales: 0, rSum: 0, rN: 0 };
    s.sales += p.sales;
    if (p.ratingAvg !== null) { s.rSum += p.ratingAvg * p.ratingCount; s.rN += p.ratingCount; }
    sellerMap.set(p.creator, s);
  }
  const sellers = [...sellerMap.values()]
    .sort((a, b) => b.sales - a.sales)
    .slice(0, 4)
    .map((s) => ({ ...s, rating: s.rN > 0 ? Math.round((s.rSum / s.rN) * 10) / 10 : null }));

  const steps = [
    { n: "01", title: t(lang, "home.s1.t"), body: t(lang, "home.s1.b") },
    { n: "02", title: t(lang, "home.s2.t"), body: t(lang, "home.s2.b") },
    { n: "03", title: t(lang, "home.s3.t"), body: t(lang, "home.s3.b") },
  ];

  const stats = [
    { value: "100%", label: t(lang, "home.stat1") },
    { value: "MonCash", label: t(lang, "home.stat2") },
    { value: t(lang, "home.stat3.v"), label: t(lang, "home.stat3") },
  ];

  return (
    <div className="bg-grain">
      <SiteNav />

      {/* BANDEAU CATÉGORIES — barre claire, texte sombre (style Bloop,
          décision porteur 2026-07-25). Fonctionne sans JS : simples liens GET
          vers le catalogue filtré. */}
      <nav
        aria-label="Catégories"
        className="overflow-x-auto border-b border-black/10 bg-cloud"
      >
        <div className="mx-auto flex max-w-6xl items-center gap-1 px-3 py-2.5">
          {PRODUCT_CATEGORIES.map((c) => (
            <Link
              key={c}
              // `cat` — c'est le paramètre que /catalogue lit (app/catalogue
              // /page.tsx). `categorie` était ignoré en silence : le clic
              // ouvrait le catalogue ENTIER sans jamais dire que le filtre
              // n'avait pas pris.
              href={`/catalogue?cat=${encodeURIComponent(c)}`}
              className="whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-semibold text-ink transition hover:bg-black/5"
            >
              {c}
            </Link>
          ))}
          <Link
            href="/catalogue"
            className="whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-semibold text-ink transition hover:bg-black/5"
          >
            {t(lang, "home.all")}
          </Link>
        </div>
      </nav>

      {/* HERO — court (≤ 40 % du viewport mobile). Chaque pixel au-dessus de
          la ligne de flottaison qui n'est ni un produit ni une recherche est
          perdu sur Android d'entrée de gamme. Promesse concrète : ce qu'on
          achète, où c'est livré, comment on paie. Pas d'animation. */}
      <section className="mx-auto max-w-6xl px-5 pb-10 pt-10 sm:pt-14">
        <div className="mx-auto max-w-3xl text-center">
          <div>
            <h1 className="text-3xl font-extrabold leading-[1.1] tracking-tight sm:text-5xl">
              {t(lang, "home.h1")}
            </h1>

            <p className="mx-auto mt-3 max-w-xl text-sm text-mist sm:text-base">
              {t(lang, "home.sub")}
            </p>

            {/* RECHERCHE — premier bloc utile, au-dessus de la ligne de
                flottaison : une marketplace physique se cherche, elle ne se
                butine pas. GET, fonctionne sans JS. */}
            <form action="/catalogue" className="mx-auto mt-6 flex max-w-xl gap-2">
              <input
                name="q"
                placeholder={t(lang, "catalog.search.ph")}
                className="min-w-0 flex-1 rounded-xl border border-line bg-ink/40 px-4 py-3 text-base outline-none focus:border-violet"
              />
              <button
                type="submit"
                className="rounded-xl bg-cloud px-5 py-3 text-sm font-semibold text-ink transition hover:opacity-90"
              >
                {t(lang, "catalog.search.btn")}
              </button>
            </form>

            {/* Un SEUL argument de confiance — le seul vérifiable aujourd'hui.
                « Livraison rapide » et « Qualité garantie » ont été retirés :
                la livraison est assurée par les vendeurs et la plateforme ne
                détient aucun stock. « Kòd konfimasyon » et « Machann verifye »
                ne sont pas ajoutés — ni l'un ni l'autre n'existe encore. */}
            <p className="mt-5 inline-flex items-center gap-2 text-sm text-mist">
              <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-cloud" strokeWidth="1.6">
                <path d="M12 2l7 4v6c0 4.4-3 8.4-7 10-4-1.6-7-5.6-7-10V6l7-4z" />
              </svg>
              {t(lang, "badge.pay")}
            </p>
          </div>
        </div>

        <div className="mx-auto mt-16 grid max-w-2xl grid-cols-3 gap-4">
          {stats.map((s) => (
            <div
              key={s.label}
              className="rounded-2xl border border-line bg-surface-maroon/60 p-4"
            >
              <p className="metric text-xl font-bold text-gradient sm:text-2xl">
                {s.value}
              </p>
              <p className="mt-1 text-xs text-mist">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 1 bis. BANDEAU PAIEMENT (maquette : « PEYE FASIL AK ») */}
      <section className="mx-auto max-w-6xl px-5 pb-4">
        <div className="flex flex-wrap items-center justify-center gap-3 rounded-2xl border border-line bg-surface/40 px-6 py-4">
          <span className="text-xs font-semibold uppercase tracking-wider text-mist">
            {t(lang, "home.pay")}
          </span>
          <span className="rounded-full bg-brand px-4 py-1.5 text-sm font-bold text-ink">
            MonCash
          </span>
          <span className="rounded-full border border-line bg-surface/60 px-4 py-1.5 text-sm font-bold text-cloud">
            Zelle&nbsp;$
          </span>
          <span className="rounded-full border border-line px-4 py-1.5 text-sm text-mist/60">
            {t(lang, "footer.natcash")}
          </span>
        </div>
      </section>

      {/* 1 ter. PRODUIT DE LA SEMAINE (maquette : « Pwodui semèn nan ») */}
      {featured && (
        <section className="mx-auto max-w-6xl px-5 py-8">
          <p className="text-xs font-semibold uppercase tracking-wider text-accent">
            {t(lang, "sec.featured")}
          </p>
          <Link
            href={`/produit/${featured.slug}`}
            className="mt-4 grid gap-6 rounded-3xl border border-line bg-surface/60 p-6 transition hover:border-brand/60 sm:grid-cols-[220px_1fr] sm:p-8"
          >
            <div
              className={`aspect-[4/3] rounded-2xl bg-gradient-to-br sm:aspect-square ${featured.accent}`}
            />
            <div className="flex flex-col justify-center">
              <p className="text-xs uppercase tracking-wider text-mist">
                {featured.category} · {featured.creator}
              </p>
              <h2 className="mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl">
                {featured.title}
              </h2>
              <p className="mt-2 max-w-xl text-sm text-mist">{featured.blurb}</p>
              <div className="mt-4 flex flex-wrap items-center gap-4">
                <span className="numeric text-2xl font-extrabold text-gradient">
                  {formatHTG(featured.priceHTG)}
                </span>
                {featured.ratingAvg !== null && (
                  <span className="text-sm text-mist">
                    <span className="text-accent">★</span> {featured.ratingAvg} ({featured.ratingCount})
                  </span>
                )}
                <span className="rounded-xl bg-brand px-5 py-2 text-sm font-semibold text-ink">
                  {t(lang, "featured.cta")}
                </span>
              </div>
            </div>
          </Link>
        </section>
      )}

      {/* 2. CATÉGORIES PRINCIPALES */}
      {categories.length > 0 && (
        <section className="mx-auto max-w-6xl px-5 py-8">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
            {t(lang, "sec.cats")}
          </h2>
          <div className="mt-5 flex flex-wrap gap-2">
            {categories.map(([cat, n]) => (
              <Link
                key={cat}
                href={`/catalogue?cat=${encodeURIComponent(cat)}`}
                className="rounded-full border border-line bg-surface/60 px-4 py-2 text-sm text-cloud transition hover:border-brand/60"
              >
                {cat} <span className="text-mist">· {n}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* 3. PRODUITS TENDANCE */}
      <HomeRow
        id="talents"
        title={t(lang, "home.trends")}
        sub={t(lang, "home.trends.sub")}
        more={t(lang, "home.all")}
        items={trending}
        cardLabels={cardLabels}
      />

      {/* 4. NOUVEAUTÉS */}
      <HomeRow
        title={t(lang, "sec.new")}
        sub={t(lang, "sec.new.sub")}
        more={t(lang, "home.all")}
        items={newest}
        cardLabels={cardLabels}
      />

      {/* 5. SERVICES POPULAIRES */}
      <HomeRow
        title={t(lang, "sec.services")}
        sub={t(lang, "sec.services.sub")}
        more={t(lang, "home.all")}
        items={services}
        cardLabels={cardLabels}
      />

      {/* 6. MEILLEURS VENDEURS */}
      {sellers.length > 0 && (
        <section className="mx-auto max-w-6xl px-5 py-12">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
            {t(lang, "sec.sellers")}
          </h2>
          <p className="mt-2 text-sm text-mist">{t(lang, "sec.sellers.sub")}</p>
          <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
            {sellers.map((s) => (
              <Link
                key={s.name}
                href={s.id ? `/createur/${s.id}` : "/catalogue"}
                className="rounded-2xl border border-line bg-surface/60 p-5 transition hover:border-brand/60"
              >
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand text-lg font-extrabold text-ink">
                  {s.name.charAt(0)}
                </span>
                <p className="mt-3 truncate font-semibold">{s.name}</p>
                <p className="mt-1 text-xs text-mist">
                  {s.rating !== null && <>★ {s.rating} · </>}
                  {s.sales} {t(lang, "sec.sellers.sales")}
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* 7. PRODUITS GRATUITS */}
      <HomeRow
        title={t(lang, "sec.free")}
        sub={t(lang, "sec.free.sub")}
        more={t(lang, "home.all")}
        items={free}
        cardLabels={cardLabels}
      />

      {/* 8. EN PROMOTION (vendeurs à code promo actif) */}
      <HomeRow
        title={t(lang, "sec.promo")}
        sub={t(lang, "sec.promo.sub")}
        more={t(lang, "home.all")}
        items={promo}
        cardLabels={cardLabels}
      />

      {/* 9. AVIS CLIENTS */}
      <section className="mx-auto max-w-6xl px-5 py-12">
        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
          {t(lang, "sec.reviews")}
        </h2>
        <p className="mt-2 text-sm text-mist">{t(lang, "sec.reviews.sub")}</p>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {([1, 2, 3] as const).map((i) => (
            <figure
              key={i}
              className="rounded-2xl border border-line bg-surface/60 p-5"
            >
              <p className="text-accent">★★★★★</p>
              <blockquote className="mt-3 text-sm leading-relaxed text-cloud">
                « {t(lang, `testi.${i}.b` as Parameters<typeof t>[1])} »
              </blockquote>
              <figcaption className="mt-4 text-xs font-semibold text-mist">
                {t(lang, `testi.${i}.n` as Parameters<typeof t>[1])}
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      {/* 10. POURQUOI CHOISIR ZABELIE DIGI */}
      <section className="mx-auto max-w-6xl px-5 py-12">
        <h2 className="text-center text-2xl font-bold tracking-tight sm:text-3xl">
          {t(lang, "sec.why")}
        </h2>
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {([
            ["🛡️", "why.1.t", "why.1.b"],
            ["✅", "why.2.t", "why.2.b"],
            ["🇭🇹", "why.3.t", "why.3.b"],
            ["⚡", "why.4.t", "why.4.b"],
          ] as const).map(([icon, tt, bb]) => (
            <div key={tt} className="rounded-2xl border border-line bg-surface/40 p-6">
              <span className="text-2xl">{icon}</span>
              <h3 className="mt-3 font-semibold">{t(lang, tt)}</h3>
              <p className="mt-2 text-sm text-mist">{t(lang, bb)}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 11. FAQ */}
      <section id="faq" className="mx-auto max-w-3xl scroll-mt-24 px-5 py-12">
        <h2 className="text-center text-2xl font-bold tracking-tight sm:text-3xl">
          {t(lang, "sec.faq")}
        </h2>
        <div className="mt-8 space-y-3">
          {([1, 2, 3, 4, 5] as const).map((i) => (
            <details
              key={i}
              className="group rounded-2xl border border-line bg-surface/40 px-5 py-4"
            >
              <summary className="cursor-pointer list-none font-semibold marker:content-none">
                <span className="mr-2 text-accent transition group-open:rotate-90 inline-block">›</span>
                {t(lang, `faq.q${i}` as Parameters<typeof t>[1])}
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-mist">
                {t(lang, `faq.a${i}` as Parameters<typeof t>[1])}
              </p>
            </details>
          ))}
        </div>
      </section>

      {/* COMMENT ÇA MARCHE */}
      <section id="comment" className="mx-auto max-w-6xl px-5 py-16">
        <h2 className="text-center text-2xl font-bold tracking-tight sm:text-3xl">
          {t(lang, "home.how")}
        </h2>
        <div className="mt-10 grid grid-cols-1 gap-5 md:grid-cols-3">
          {steps.map((step) => (
            <div
              key={step.n}
              className="rounded-2xl border border-line bg-surface/40 p-6"
            >
              <span className="text-3xl font-extrabold text-gradient">{step.n}</span>
              <h3 className="mt-4 text-lg font-semibold">{step.title}</h3>
              <p className="mt-2 text-sm text-mist">{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* FONDATEUR */}
      <section className="mx-auto max-w-6xl px-5 py-16">
        <div className="glass mx-auto flex max-w-3xl flex-col items-center gap-8 rounded-3xl p-8 sm:flex-row sm:p-10">
          <div className="relative shrink-0">
            <Image
              src="/brand/eliezer-portrait.jpg"
              alt={t(lang, "founder.name")}
              width={160}
              height={160}
              priority
              className="h-40 w-40 rounded-2xl object-cover object-top ring-2 ring-accent/50"
            />
            <span className="absolute -bottom-2 -right-2 grid h-9 w-9 place-items-center rounded-xl bg-brand text-lg">
              🇭🇹
            </span>
          </div>
          <div className="text-center sm:text-left">
            <p className="text-xs font-semibold uppercase tracking-wider text-accent">
              {t(lang, "founder.title")}
            </p>
            <blockquote className="mt-3 text-lg leading-relaxed text-cloud">
              « {t(lang, "founder.quote")} »
            </blockquote>
            <p className="mt-4 text-sm font-semibold">
              {t(lang, "founder.name")}
              <span className="ml-2 font-normal text-mist">
                {t(lang, "founder.role")}
              </span>
            </p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-6xl px-5 py-16">
        <div className="glass glow-ring relative overflow-hidden rounded-3xl px-8 py-14 text-center">
          <h2 className="mx-auto max-w-2xl text-3xl font-extrabold tracking-tight sm:text-4xl">
            {t(lang, "home.final.a")}{" "}
            <span className="text-gradient">{t(lang, "home.final.b")}</span>.
          </h2>
          <p className="mx-auto mt-4 max-w-md text-mist">
            {t(lang, "home.final.sub")}
          </p>
          <Link
            href="/vendre"
            className="mt-8 inline-block rounded-xl bg-cloud px-7 py-3 text-sm font-semibold text-ink transition hover:opacity-90"
          >
            {t(lang, "home.final.cta")}
          </Link>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
