import Link from "next/link";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { CartPayButton } from "@/components/cart-pay-button";
import { RemoveFromCart } from "@/components/remove-from-cart";
import { createClient } from "@/lib/supabase/server";
import { formatHTG } from "@/lib/sample-data";
import { getLang } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mon panier — Zabelie" };

/**
 * Le panier — lecture par le CLIENT DE SESSION, la RLS de 0058 fait le tri.
 *
 * Les prix affichés sont LUS EN BASE à l'instant du rendu, jamais stockés au
 * panier (règle dure n°3). Le total est indicatif : le montant qui fera foi
 * sera celui que le serveur recalculera au paiement groupé (docs/27 §3).
 *
 * Tant que `confirm_group_payment` n'existe pas, la page le DIT (cart.note)
 * et chaque article renvoie à sa page pour payer — un panier honnête vaut
 * mieux qu'un bouton « payer tout » qui n'a pas encore son chemin d'argent.
 */
export default async function PanierPage() {
  const lang = await getLang();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <Coquille titre={t(lang, "cart.title")}>
        <p className="mt-4 text-sm text-mist">{t(lang, "purchases.login.b")}</p>
        <Link
          href={`/connexion?next=${encodeURIComponent("/panier")}`}
          className="mt-4 inline-block rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-on-brand"
        >
          {t(lang, "nav.login")}
        </Link>
      </Coquille>
    );
  }

  const { data: lignes, error } = await supabase
    .from("zabelie_cart_items")
    .select(
      "product_id, added_at, product:products(slug, title, price_htg, kind, creator:profiles!products_seller_id_fkey(display_name))"
    )
    .order("added_at", { ascending: false });

  type Ligne = {
    product_id: string;
    product: {
      slug: string;
      title: string;
      price_htg: number;
      creator: { display_name: string | null } | null;
    } | null;
  };
  const items = ((lignes ?? []) as unknown as Ligne[]).filter((l) => l.product);
  const total = items.reduce((n, l) => n + (l.product?.price_htg ?? 0), 0);

  return (
    <Coquille titre={t(lang, "cart.title")}>
      {error && (
        // 0058 pas encore appliquée, ou incident : l'erreur se DIT, ne se
        // déguise pas en panier vide — un panier qui a « perdu » ses articles
        // est la pire chose qu'une boutique puisse montrer.
        <p className="mt-4 text-sm text-danger-text">{t(lang, "error.generic")}</p>
      )}
      {!error && items.length === 0 && (
        <div className="mt-6 rounded-2xl border border-dashed border-line bg-surface/40 p-8 text-center">
          <p className="text-sm text-mist">{t(lang, "cart.empty")}</p>
          <Link
            href="/catalogue"
            className="mt-4 inline-block rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-on-brand"
          >
            {t(lang, "nav.catalog")}
          </Link>
        </div>
      )}
      {!error && items.length > 0 && (
        <>
          <ul className="mt-6 divide-y divide-line rounded-2xl border border-line bg-surface/40">
            {items.map((l) => (
              <li
                key={l.product_id}
                className="flex flex-wrap items-center gap-x-4 gap-y-3 p-4"
              >
                <div className="min-w-0 flex-1 basis-full sm:basis-auto">
                  <Link
                    href={`/produit/${l.product!.slug}`}
                    className="font-semibold text-cloud transition hover:text-accent"
                  >
                    {l.product!.title}
                  </Link>
                  {l.product!.creator?.display_name && (
                    <p className="text-xs text-mist">
                      {t(lang, "product.by")} {l.product!.creator.display_name}
                    </p>
                  )}
                </div>
                <span className="numeric shrink-0 font-bold text-cloud">
                  {formatHTG(l.product!.price_htg)}
                </span>
                <CartPayButton
                  productId={l.product_id}
                  labels={{
                    pay: t(lang, "cart.pay"),
                    loading: t(lang, "cart.paying"),
                    error: t(lang, "error.generic"),
                  }}
                />
                <RemoveFromCart
                  productId={l.product_id}
                  label={t(lang, "cart.remove")}
                />
              </li>
            ))}
          </ul>
          <div className="mt-4 flex items-center justify-between rounded-2xl border border-line bg-surface/40 px-4 py-3">
            <span className="text-sm font-semibold text-mist">{t(lang, "cart.total")}</span>
            <span className="numeric text-xl font-extrabold text-gradient">
              {formatHTG(total)}
            </span>
          </div>
          <p className="mt-3 text-center text-xs text-mist">{t(lang, "cart.note")}</p>
        </>
      )}
    </Coquille>
  );
}

function Coquille({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <div className="bg-grain min-h-screen">
      <SiteNav />
      <main className="mx-auto max-w-3xl px-5 py-16">
        <h1 className="text-3xl font-extrabold tracking-tight">{titre}</h1>
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
