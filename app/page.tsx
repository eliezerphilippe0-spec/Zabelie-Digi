import Link from "next/link";
import Image from "next/image";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { ProductCard } from "@/components/product-card";
import { TrustBar } from "@/components/trust-bar";
import { WhatsAppFab } from "@/components/whatsapp-fab";
import { whatsappHref } from "@/lib/whatsapp";
import { getPublishedProducts, isSupabaseConfigured, type ProductView } from "@/lib/products";
import { createAdminClient } from "@/lib/supabase/admin";
import { getLang } from "@/lib/i18n-server";
import { t, tn } from "@/lib/i18n";
import { isDownloadable, isService } from "@/lib/product-kind";
import type { ProductCardLabels } from "@/components/product-card";
import { siteUrl } from "@/lib/site-url";
import { classesRangee, rangeeVisible, vendeursAffichables } from "@/lib/home-sections";

export const dynamic = "force-dynamic";

// Canonique explicite (metadataBase : lib/site-url). PAS de hreflang : la
// langue vit dans un cookie, toutes les langues partagent la même URL — un
// hreflang qui pointe quatre fois sur la même adresse est un signal faux.
export const metadata = {
  alternates: { canonical: "/" },
};

/**
 * PHOTO DE LA BANNIÈRE — fournie par le porteur, jamais générée (brief §8.8).
 * Tant qu'aucun fichier n'est posé à ce chemin, la bannière est un aplat de
 * chrome : un état vide honnête, pas un décor. Spécification à fournir :
 * JPEG/WebP 1600 × 900, ≤ 120 Ko, sujet dans le tiers médian, sans texte
 * incrusté (`docs/home-premium/PLAN.md` §7). Vérifié au rendu, pas au build :
 * la photo peut arriver sans redéploiement de code.
 */
const HERO_IMAGE = "/brand/hero-accueil.jpg";
function heroImageDisponible(): boolean {
  return existsSync(join(process.cwd(), "public", HERO_IMAGE));
}

/**
 * Rangée de produits — RÈGLE DES SEUILS (lib/home-sections, brief §4.3).
 * Sous SEUIL_RANGEE items, la section n'existe pas ; entre 4 et 5, elle est
 * masquée au-delà de `lg` ; jamais un titre au-dessus du néant.
 * Grille : 2 colonnes mobile, 4 tablette, 6 desktop, gouttière 12 px (§4.4).
 */
function HomeRow({
  id,
  title,
  more,
  items,
  cardLabels,
}: {
  id?: string;
  title: string;
  more: string;
  items: ProductView[];
  cardLabels: ProductCardLabels;
}) {
  if (!rangeeVisible(items.length)) return null;
  return (
    <section id={id} className={`mx-auto max-w-6xl px-3 pt-6 ${classesRangee(items.length)}`}>
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-xl tracking-tight sm:text-2xl">{title}</h2>
        <Link href="/catalogue" className="shrink-0 text-sm font-medium text-mist transition hover:text-cloud">
          {more}
        </Link>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        {items.map((p) => (
          <ProductCard key={p.slug} product={p} labels={cardLabels} />
        ))}
      </div>
    </section>
  );
}

/** Vendeurs avec au moins un code promo actif — vide en mode démo. */
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

/**
 * Produits ayant AU MOINS UNE commande PAYÉE — la seule vente qui compte pour
 * « Meilleurs vendeurs » (brief §4.3). `sales_count` est un compteur
 * applicatif ; une commande `paid` est un paiement confirmé serveur à serveur.
 * Lecture seule, bornée, silencieuse en cas d'erreur (la section s'efface).
 */
async function produitsAvecVentePayee(): Promise<Map<string, number>> {
  const compte = new Map<string, number>();
  if (!isSupabaseConfigured()) return compte;
  try {
    const admin = createAdminClient();
    const { data } = await admin.from("orders").select("product_id").eq("status", "paid").limit(5000);
    for (const o of data ?? []) compte.set(o.product_id, (compte.get(o.product_id) ?? 0) + 1);
  } catch {
    /* section masquée */
  }
  return compte;
}

export default async function HomePage() {
  const [products, lang, promoSellers, ventesPayees] = await Promise.all([
    // getPublishedProducts lève en cas d'erreur Supabase (BL-116) ; l'accueil
    // n'a pas de page d'erreur, et une liste vide y est sans risque : toutes
    // les rangées s'effacent sous le seuil.
    getPublishedProducts().catch(() => []),
    getLang(),
    promoSellerIds(),
    produitsAvecVentePayee(),
  ]);

  const cardLabels: ProductCardLabels = {
    kindFile: t(lang, "card.kind.file"),
    kindService: t(lang, "card.kind.service"),
    kindPhysical: t(lang, "card.kind.physical"),
    by: t(lang, "product.by"),
    sales: t(lang, "product.sales"),
    salesOne: t(lang, "product.sales.one"),
    lang,
  };

  // Une seule requête catalogue alimente toutes les rangées.
  const bySales = [...products].sort((a, b) => b.sales - a.sales);
  const principaux = bySales.slice(0, 12); // « Pwodui yo »
  const newest = products.slice(0, 6); // requête déjà triée par date desc
  const services = bySales.filter((p) => isService(p.kind, p.id)).slice(0, 6);
  const fichiers = bySales.filter((p) => isDownloadable(p.kind)).slice(0, 6);
  const free = products.filter((p) => p.priceHTG === 0).slice(0, 6);
  const promo = bySales.filter((p) => p.creatorId && promoSellers.has(p.creatorId)).slice(0, 6);

  /* UN PRODUIT NE REMPLIT PAS DEUX RANGÉES (audit UX 2026-09-02, #10) : une
   * rangée n'est rendue que si elle apporte au moins UN produit qu'aucune
   * rangée plus haut n'a montré. La grille principale ouvre la page. */
  const vus = new Set<string>();
  const inedit = (items: ProductView[]): boolean => {
    if (!items.some((p) => !vus.has(p.slug))) return false;
    for (const p of items) vus.add(p.slug);
    return true;
  };

  const sellerMap = new Map<
    string,
    { name: string; id: string | null; ventesPayees: number; rSum: number; rN: number }
  >();
  for (const p of products) {
    const s = sellerMap.get(p.creator) ?? { name: p.creator, id: p.creatorId, ventesPayees: 0, rSum: 0, rN: 0 };
    s.ventesPayees += ventesPayees.get(p.id) ?? 0;
    if (p.ratingAvg !== null) {
      s.rSum += p.ratingAvg * p.ratingCount;
      s.rN += p.ratingCount;
    }
    sellerMap.set(p.creator, s);
  }
  const sellers = vendeursAffichables([...sellerMap.values()])
    .sort((a, b) => b.ventesPayees - a.ventesPayees)
    .slice(0, 4)
    .map((s) => ({ ...s, rating: s.rN > 0 ? Math.round((s.rSum / s.rN) * 10) / 10 : null }));

  const wa = whatsappHref(t(lang, "wa.prefill"));
  const heroImage = heroImageDisponible();

  // JSON-LD : Organization + WebSite avec SearchAction (sitelinks searchbox).
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Organization", name: "Zabelie", url: siteUrl(), logo: `${siteUrl()}/icon.svg` },
      {
        "@type": "WebSite",
        name: "Zabelie",
        url: siteUrl(),
        potentialAction: {
          "@type": "SearchAction",
          target: `${siteUrl()}/catalogue?q={search_term_string}`,
          "query-input": "required name=search_term_string",
        },
      },
    ],
  };

  return (
    <div className="bg-grain">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <SiteNav />

      {/* `<main id="main">` : cible du lien d'évitement de l'en-tête, et le
          repère que Lighthouse réclamait (landmark-one-main) — l'accueil était
          la seule page sans lui (Phase 0, mesuré). */}
      <main id="main">
        {/* BANNIÈRE — accueil premium §4.2 : UNE bannière, le h1 DEDANS, une
            phrase (≤ 8 mots), un seul CTA orange. Plus de titre séparé, plus de
            carrousel : le premier écran appartient aux produits. La photo est
            celle du porteur quand elle existe ; sinon un aplat de chrome. */}
        <section className="mx-auto max-w-6xl px-3 pt-3">
          <div
            className="relative flex min-h-[180px] flex-col justify-end overflow-hidden rounded-2xl bg-chrome p-4 text-on-chrome sm:min-h-[240px] sm:p-6"
            style={heroImage ? undefined : { backgroundImage: "var(--brand-gradient)" }}
          >
            {heroImage && (
              <Image
                src={HERO_IMAGE}
                alt=""
                fill
                priority
                sizes="(min-width: 1152px) 1152px, 100vw"
                className="object-cover"
              />
            )}
            {heroImage && <div className="absolute inset-0 bg-chrome/50" aria-hidden="true" />}
            <div className="relative">
              <h1 className="max-w-xl text-[26px] leading-tight tracking-tight sm:text-4xl">
                {t(lang, "hero.s1.t")}
              </h1>
              <Link
                href="/catalogue"
                className="mt-3 inline-flex min-h-11 items-center rounded-xl bg-brand px-5 text-sm font-bold text-on-brand transition hover:opacity-90 active:scale-[0.97]"
              >
                {t(lang, "hero.s1.cta")}
              </Link>
            </div>
          </div>
        </section>

        {/* CONFIANCE — quatre repères tenus, une ligne (§4.5). */}
        <TrustBar
          compact
          items={[
            { t: t(lang, "trust.c1"), icone: "bouclier" },
            { t: t(lang, "trust.c2"), icone: "coffre" },
            { t: t(lang, "trust.c3"), icone: "gourde" },
            { t: t(lang, "trust.c4"), icone: "message" },
          ]}
        />

        {/* PRODUITS — la première rangée doit tenir au-dessus de la ligne de
            flottaison (A1). Sous le seuil, aucune rangée : l'accueil dit alors
            honnêtement que le catalogue se remplit (bloc vendeur en bas). */}
        {inedit(principaux) && (
          <HomeRow title={t(lang, "home.products")} more={t(lang, "home.all")} items={principaux} cardLabels={cardLabels} />
        )}
        {inedit(newest) && (
          <HomeRow title={t(lang, "sec.new")} more={t(lang, "home.all")} items={newest} cardLabels={cardLabels} />
        )}
        {inedit(fichiers) && (
          <HomeRow title={t(lang, "sec.digital")} more={t(lang, "home.all")} items={fichiers} cardLabels={cardLabels} />
        )}
        {/* Cible de « Talents » (menu compte + pied de page) : posée sur une
            balise du FLUX, avant la rangée des services, jamais en prop d'une
            rangée qui peut s'effacer. `scroll-mt-24` compense l'en-tête collant. */}
        <div id="talents" className="scroll-mt-24" aria-hidden="true" />
        {inedit(services) && (
          <HomeRow title={t(lang, "sec.services")} more={t(lang, "home.all")} items={services} cardLabels={cardLabels} />
        )}
        {inedit(free) && (
          <HomeRow title={t(lang, "sec.free")} more={t(lang, "home.all")} items={free} cardLabels={cardLabels} />
        )}
        {inedit(promo) && (
          <HomeRow title={t(lang, "sec.promo")} more={t(lang, "home.all")} items={promo} cardLabels={cardLabels} />
        )}

        {/* MEILLEURS VENDEURS — ≥ 3 vendeurs avec ≥ 1 vente PAYÉE (§4.3). */}
        {sellers.length > 0 && (
          <section className="mx-auto max-w-6xl px-3 pt-8">
            <h2 className="text-xl tracking-tight sm:text-2xl">{t(lang, "sec.sellers")}</h2>
            <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
              {sellers.map((s) => (
                <Link
                  key={s.name}
                  href={s.id ? `/createur/${s.id}` : "/catalogue"}
                  className="rounded-xl border border-line bg-surface p-4 transition active:scale-[0.97]"
                >
                  <span className="grid h-10 w-10 place-items-center rounded-lg bg-chrome text-base font-extrabold text-on-chrome">
                    {s.name.charAt(0)}
                  </span>
                  <p className="mt-3 truncate font-semibold">{s.name}</p>
                  <p className="mt-1 text-sm text-mist">
                    {s.rating !== null && <>★ {s.rating} · </>}
                    {s.ventesPayees} {tn(lang, s.ventesPayees, "sec.sellers.sales.one", "sec.sellers.sales")}
                  </p>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* FONDATEUR — compact, en fin de page (§4.5). */}
        <section className="mx-auto max-w-6xl px-3 pt-10">
          <div className="flex items-start gap-4 rounded-2xl border border-line bg-surface p-4 sm:items-center sm:p-6">
            <Image
              src="/brand/eliezer-portrait.jpg"
              alt={t(lang, "founder.name")}
              width={72}
              height={72}
              className="h-[72px] w-[72px] shrink-0 rounded-xl object-cover object-top"
            />
            <div className="min-w-0">
              <blockquote className="text-sm leading-relaxed text-cloud sm:text-base">« {t(lang, "founder.quote")} »</blockquote>
              <p className="mt-2 text-sm font-semibold">
                {t(lang, "founder.name")}
                <span className="ml-2 font-normal text-mist">{t(lang, "founder.role")}</span>
              </p>
            </div>
          </div>
        </section>

        {/* VENDRE + COMMENT ÇA MARCHE — un seul bloc en fin de page (§4.2, §4.6) :
            la carte « Ouvrez votre boutique » descendue ici, et « Comment ça
            marche » réduit à deux liens vers /aide et /vendre, qui portent les
            étapes. `id="comment"` : cible des liens du menu et du pied de page. */}
        <section id="comment" className="mx-auto max-w-6xl scroll-mt-24 px-3 pb-24 pt-10">
          <div className="rounded-2xl border border-line bg-surface p-6 text-center sm:p-10">
            <h2 className="mx-auto max-w-2xl text-2xl tracking-tight sm:text-3xl">{t(lang, "rail.shop.t")}</h2>
            <p className="mx-auto mt-3 max-w-md text-sm text-mist">{t(lang, "home.final.sub")}</p>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/vendre"
                className="inline-flex min-h-11 items-center rounded-xl bg-brand px-6 text-sm font-bold text-on-brand transition hover:opacity-90 active:scale-[0.97]"
              >
                {t(lang, "home.cta.sell")}
              </Link>
              {/* Texte ENCRE sur la teinte orange à 10 % : `text-accent` y
                  mesurait 4,35:1 (Lighthouse, Phase 3) — sous le seuil. */}
              <span className="rounded-lg bg-brand/10 px-3 py-1.5 text-sm font-bold text-cloud">{t(lang, "rail.shop.free")}</span>
            </div>
            <p className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm">
              <Link href="/aide#comment" className="inline-flex min-h-11 items-center font-medium text-cloud underline-offset-4 hover:underline">
                {t(lang, "home.how.buy")}
              </Link>
              <Link href="/vendre#comment" className="inline-flex min-h-11 items-center font-medium text-cloud underline-offset-4 hover:underline">
                {t(lang, "home.how.sell")}
              </Link>
              <Link href="/aide#faq" className="inline-flex min-h-11 items-center font-medium text-cloud underline-offset-4 hover:underline">
                {t(lang, "sec.faq")}
              </Link>
            </p>
          </div>
        </section>
      </main>

      <WhatsAppFab href={wa} label={t(lang, "wa.chat")} />
      <SiteFooter />
    </div>
  );
}
