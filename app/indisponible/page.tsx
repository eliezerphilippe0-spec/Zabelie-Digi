import Link from "next/link";
import { SiteNav } from "@/components/site-nav";
import { ProductCard, type ProductCardLabels } from "@/components/product-card";
import { getLang } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";
import { isSupabaseConfigured } from "@/lib/products";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCreator, type CreatorProfile } from "@/lib/creators";
import { hrefBoutique } from "@/lib/boutique-href";
import { motsDeRecherche } from "@/lib/existence-publique";

export const dynamic = "force-dynamic";
export const metadata = { title: "Page indisponible — Zabelie", robots: { index: false, follow: false } };

/**
 * L'ÉCRAN D'UN LIEN MORT — servi en 404 par le proxy (`lib/existence-publique.ts`).
 *
 * Un lien de produit circule sur WhatsApp bien après que l'objet est vendu ou
 * retiré. Amazon et Etsy ne laissent pas ce visiteur sur un cul-de-sac : ils
 * disent que l'article n'est plus là, puis montrent la boutique et de quoi
 * continuer. C'est ce que fait cette page, dans cet ordre :
 *  1. la boutique qui le vendait, et ses autres offres publiées ;
 *  2. une recherche relancée avec les mots de l'adresse ;
 *  3. le catalogue et l'accueil.
 *
 * Retrouver la boutique d'un produit RETIRÉ demande le client de service : la
 * RLS ne laisse lire que les produits publiés. On n'en lit qu'une colonne, et
 * jamais pour un brouillon — un brouillon n'a jamais été public, son adresse
 * ne doit rien révéler.
 */
async function boutiqueDuProduit(slug: string): Promise<CreatorProfile | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const { data } = await createAdminClient()
      .from("products")
      .select("seller_id")
      .eq("slug", slug)
      .neq("status", "draft")
      .maybeSingle();
    const vendeur = (data as { seller_id?: string } | null)?.seller_id;
    return vendeur ? await getCreator(vendeur) : null;
  } catch {
    return null;
  }
}

export default async function Indisponible({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; cle?: string }>;
}) {
  const [{ type, cle }, lang] = await Promise.all([searchParams, getLang()]);
  const produit = type === "produit";
  const boutique = produit && cle ? await boutiqueDuProduit(cle) : null;
  const autres = boutique?.products.slice(0, 4) ?? [];
  /* Un identifiant de créateur n'a pas de mots à chercher. */
  const mots = type === "createur" ? "" : motsDeRecherche(cle);

  const cardLabels: ProductCardLabels = {
    kindFile: t(lang, "card.kind.file"),
    kindService: t(lang, "card.kind.service"),
    kindPhysical: t(lang, "card.kind.physical"),
    by: t(lang, "product.by"),
    sales: t(lang, "product.sales"),
    salesOne: t(lang, "product.sales.one"),
    lang,
    titleFallback: t(lang, "card.title.fallback"),
    photoMissing: t(lang, "home.photo.missing"),
    detail: t(lang, "home.product.cta"),
  };

  return (
    <div className="bg-grain min-h-dvh">
      <SiteNav />
      <main id="main" className="mx-auto max-w-3xl px-5 py-16">
        <div className="mx-auto max-w-md text-center">
          <h1 className="text-2xl font-extrabold">{t(lang, produit ? "gone.product.title" : "gone.shop.title")}</h1>
          <p className="mt-3 text-mist">{t(lang, produit ? "gone.product.body" : "gone.shop.body")}</p>
        </div>

        {boutique && (
          <section aria-labelledby="gone-boutique" className="mt-10">
            <h2 id="gone-boutique" className="text-lg font-bold">
              {t(lang, "gone.more", { nom: boutique.displayName })}
            </h2>
            {autres.length > 0 && (
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {autres.map((p) => (
                  <ProductCard key={p.slug} product={p} labels={cardLabels} />
                ))}
              </div>
            )}
            <Link
              href={hrefBoutique(boutique)}
              className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold underline"
            >
              {t(lang, "gone.shop.cta")}
            </Link>
          </section>
        )}

        <div className="mx-auto mt-10 flex max-w-md flex-col gap-3">
          {mots && (
            <Link
              href={`/catalogue?q=${encodeURIComponent(mots)}`}
              className="bouton inline-flex min-h-11 items-center justify-center rounded-xl bg-brand px-6 py-3 text-sm font-semibold text-on-brand"
            >
              {t(lang, "gone.search", { q: mots })}
            </Link>
          )}
          <Link
            href="/catalogue"
            className="bouton inline-flex min-h-11 items-center justify-center rounded-xl border border-line px-6 py-3 text-sm font-semibold text-cloud"
          >
            {t(lang, "err.404.catalog")}
          </Link>
          <Link href="/" className="inline-flex min-h-11 items-center justify-center text-sm text-mist hover:text-cloud">
            {t(lang, "err.404.home")}
          </Link>
        </div>
      </main>
    </div>
  );
}
