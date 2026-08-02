import Link from "next/link";
import Image from "next/image";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { ProductCard } from "@/components/product-card";
import {
  getCatalogueCategories,
  getPublishedProducts,
  isSupabaseConfigured,
  type ProductView,
} from "@/lib/products";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatHTG } from "@/lib/sample-data";
import { getLang } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";
import { isService } from "@/lib/product-kind";
import type { ProductCardLabels } from "@/components/product-card";
import { ROUNDING_IN_FORCE } from "@/lib/commission";

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
  const [products, lang, promoSellers, catalogueCategories] = await Promise.all([
    // Correctif audit : getPublishedProducts lève désormais en cas d'erreur
    // Supabase (BL-116, pour empêcher un repli silencieux sur le catalogue
    // vers des produits de démo inachetables) — mais l'accueil n'a pas cette
    // page d'erreur, il n'y a AUCUN app/error.tsx dans le projet. Un incident
    // transitoire faisait planter tout l'accueil. Ici, une liste vide est
    // sans risque : toutes les sections se masquent déjà si vides.
    getPublishedProducts().catch(() => []),
    getLang(),
    promoSellerIds(),
    // Requête séparée plutôt que dérivée de `products` : celle-ci est bornée à
    // 60 lignes, et une catégorie qui n'existerait qu'au-delà disparaîtrait de
    // la barre sans que personne ne le voie.
    getCatalogueCategories(),
  ]);

  const cardLabels: ProductCardLabels = {
    kindFile: t(lang, "card.kind.file"),
    kindService: t(lang, "card.kind.service"),
    kindPhysical: t(lang, "card.kind.physical"),
    by: t(lang, "product.by"),
    sales: t(lang, "product.sales"),
  };

  // Dérivations : une seule requête catalogue alimente toutes les sections.
  const bySales = [...products].sort((a, b) => b.sales - a.sales);
  const featured = bySales[0] ?? null; // « Pwodui semèn nan »
  const trending = bySales.slice(0, 6);
  const newest = products.slice(0, 3); // requête déjà triée par date desc
  const services = bySales.filter((p) => isService(p.kind, p.id)).slice(0, 3);
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
          vers le catalogue filtré.

          V-13 : la barre affichait SIX LIBELLÉS DIGITAUX EN DUR (Photo,
          Business, Musique…) sous un titre qui promet des pièces auto. Elle
          n'annonçait pas seulement des pages vides, elle annonçait le mauvais
          commerce. La brancher telle quelle sur la taxonomie l'aurait fait
          passer de six catégories fausses à seize catégories vides.
          Elle est donc DÉRIVÉE DU CATALOGUE : une catégorie n'apparaît que si
          un produit publié s'y trouve. À catalogue vide — l'état actuel — la
          barre ne s'affiche pas du tout. */}
      {catalogueCategories.length > 0 && (
      <nav
        aria-label="Catégories"
        className="overflow-x-auto border-b border-black/10 bg-cloud"
      >
        <div className="mx-auto flex max-w-6xl items-center gap-1 px-3 py-2.5">
          {catalogueCategories.map((c) => (
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
      )}

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

            {/* ACTION VENDEUR — rendue au hero.
                `home.cta.sell` était traduite dans QUATRE langues et n'avait
                AUCUN site d'appel : le bouton avait disparu d'ici sans que
                rien ne le signale, et le titre acheteur est resté seul
                au-dessus d'un champ de recherche pendant que toute la page en
                dessous s'adresse au vendeur (Pibliye / Resevwa lajan /
                Livre & retire, puis « Sa w ap vann merite peye » → /vendre).
                Ce n'était pas un choix de positionnement, c'était une
                régression silencieuse. `tests/i18n-cles-mortes.test.ts` ferme
                la classe.
                Le chemin acheteur n'est pas retiré pour autant : la recherche
                reste juste en dessous, et le catalogue est dans la nav. */}
            <Link
              href="/vendre"
              className="mt-6 inline-block rounded-xl bg-cloud px-7 py-3 text-sm font-semibold text-ink transition hover:opacity-90"
            >
              {t(lang, "home.cta.sell")}
            </Link>

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

        <div className="mx-auto mt-16 grid max-w-2xl grid-cols-3 gap-2 sm:gap-4">
          {stats.map((s) => (
            <div
              key={s.label}
              className="rounded-2xl border border-line bg-surface-maroon/60 p-3 sm:p-4"
            >
              {/* RES-01 — à 360 px, trois colonnes laissent ~96 px par tuile.
                  « MonCash » et « Livraison » y débordaient en `text-xl` :
                  vérifié par capture, dans les quatre langues, pas déduit du
                  CSS. Deux corrections qui se complètent :
                    • `text-base` sous `sm:` — la valeur redevient la plus
                      grande de la tuile sans réclamer une largeur qu'elle n'a
                      pas ;
                    • `break-words` — « MonCash » n'a pas d'espace, donc rien
                      ne peut le couper : sans cette règle un mot plus long
                      déborderait encore, quelle que soit la taille choisie.
                  PAS de `truncate` : couper « Livrais… » rendrait la coupure
                  intentionnelle et l'information resterait perdue.

                  `break-words` reste comme FILET, pas comme solution. Avec
                  `text-base` et la gouttière/rembourrage resserrés sous `sm:`,
                  « MonCash » tient sur UNE ligne — mesuré dans le navigateur,
                  pas supposé. Le filet ne sert que si un libellé plus long
                  arrive un jour : il se coupera plutôt que de sortir de sa
                  boîte. Une marque coupée est laide ; une marque hors cadre
                  est cassée. */}
              <p className="metric break-words text-base font-bold text-gradient sm:text-2xl">
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
          {/* `text-mist/60` mesurait 3,56:1 sur ce fond (mist #a6a6a6 à 60 %
              donne rgb(103,103,103) sur rgb(7,7,7)) — sous le seuil WCAG AA de
              4,5:1. L'opacité servait à dire « pas encore disponible », mais la
              couleur ne doit jamais porter seule une information : le libellé
              « — bientôt » l'énonce déjà, et le rail reste visuellement second
              par sa bordure là où MonCash et Zelle sont pleins. Sans opacité :
              8,28:1 (mesuré sur la page rendue, pas déduit du token). */}
          <span className="rounded-full border border-line px-4 py-1.5 text-sm text-mist">
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

      {/* Cible de « Talents » (nav ×2 + pied de page). Posée sur une balise du
          FLUX, jamais en prop de HomeRow : `HomeRow` s'efface à vide (V-13,
          ligne 38) et emportait l'ancre avec elle — les trois liens ne
          faisaient alors rien. Elle était en outre posée sur la rangée
          TENDANCES, pas sur les services qu'elle prétend désigner.
          `scroll-mt-24` compense le bandeau collant.
          Verrouillé par tests/ancres-navigation.test.ts. */}
      <div id="talents" className="scroll-mt-24" aria-hidden="true" />

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

      {/* 9. AVIS CLIENTS — SECTION RETIRÉE (2026-08-01)
          Elle bouclait sur [1, 2, 3] en dur, imprimait ★★★★★ en dur, et tirait
          « Woodley P. », « Fabiola M. », « Ricardo S. » de chaînes i18n. Aucune
          garde : elle se rendait TOUJOURS, y compris avec zéro commande en base
          — l'état actuel de la production.

          Ce n'était pas un résidu de vocabulaire comme les autres. Les autres
          annonçaient le mauvais commerce ; celui-ci affirmait un fait faux sur
          des personnes nommées, sous deux garanties de vérification :
          « avis vérifiés uniquement » (sec.reviews.sub) et « seuls les
          acheteurs ayant réellement payé peuvent noter — garanti par la base
          de données » (why.2.b). Le texte invoquait la base comme preuve alors
          que rien de ce bloc n'en venait.

          Retirée plutôt que reformulée : tant qu'aucune commande n'existe, il
          n'y a rien de vrai à afficher. `why.2` tombe avec elle — une garantie
          de vérification sans avis à vérifier n'a pas d'objet.

          Elle revient le jour où elle lit `reviews` en base, avec une garde de
          vacuité comme toutes les autres sections (V-13). Les clés supprimées
          sont dans l'historique git. */}

      {/* 10. POURQUOI CHOISIR ZABELIE */}
      <section className="mx-auto max-w-6xl px-5 py-12">
        <h2 className="text-center text-2xl font-bold tracking-tight sm:text-3xl">
          {t(lang, "sec.why")}
        </h2>
        {/* `why.2` — « Avis 100 % vérifiés … garanti par la base de données »
            — retiré avec la section Avis clients : la garantie n'avait plus
            rien à garantir. Trois colonnes au lieu de quatre. */}
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {([
            ["🛡️", "why.1.t", "why.1.b"],
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
                {/* La réponse 3 annonce le taux ET l'arrondi. Elle suit donc
                    la règle DÉPLOYÉE (`ROUNDING_IN_FORCE`) au lieu d'attendre
                    qu'on pense à la réécrire le jour où `0044` est appliquée :
                    une annonce commerciale qu'il faut penser à mettre à jour
                    finit toujours par décrire l'état d'avant. */}
                {t(
                  lang,
                  i === 3 && ROUNDING_IN_FORCE === "floor"
                    ? "faq.a3.floor"
                    : (`faq.a${i}` as Parameters<typeof t>[1]),
                )}
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
