import Link from "next/link";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { CartPayButton } from "@/components/cart-pay-button";
import { RemoveFromCart } from "@/components/remove-from-cart";
import { createClient } from "@/lib/supabase/server";
import { formatHTG } from "@/lib/sample-data";
import { getLang } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";
import { isProductKind, isDownloadable } from "@/lib/product-kind";

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
          className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-on-brand"
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
      /* ⚠️ `kind` ÉTAIT DÉJÀ SÉLECTIONNÉ (la requête ci-dessus le demande) et
       * ce type l'omettait : la donnée arrivait et se perdait. Le groupement
       * ci-dessous ne coûte donc aucune requête de plus. */
      kind: string;
      creator: { display_name: string | null } | null;
    } | null;
  };
  const items = ((lignes ?? []) as unknown as Ligne[]).filter((l) => l.product);
  const total = items.reduce((n, l) => n + (l.product?.price_htg ?? 0), 0);

  /* ── GROUPEMENT PAR MODE DE REMISE ────────────────────────────────────────
   *
   * Question laissée ouverte le 2026-08-27 : où mettre « le vendeur n'est payé
   * qu'après la remise » sur un panier qui mélange les types ? Par ligne, c'est
   * du bruit ; en bas de page, c'est FAUX pour les fichiers, dont la livraison
   * est immédiate.
   *
   * La réponse n'est pas à inventer — c'est la convention des places de marché
   * qui vendent physique ET numérique : **grouper par mode de remise, et
   * énoncer la garantie UNE fois, au niveau où elle est vraie.** Amazon sépare
   * les envois des articles numériques et affiche sa garantie au niveau de la
   * commande ; Etsy groupe par boutique et affiche sa protection une fois.
   *
   * Ici deux groupes suffisent, parce qu'il n'y a que deux mondes :
   *   • à télécharger      → livraison immédiate, aucun escrow à annoncer
   *   • à remettre         → le vendeur doit agir, et l'escrow protège
   *
   * ⚠️ Et s'il n'y a QU'UN groupe, aucun en-tête n'est affiché. Un titre de
   * section au-dessus d'une seule section est du bruit — c'est aussi ce que
   * font les géants : personne n'écrit « Envoi 1 sur 1 ». */
  const aTelecharger = items.filter(
    (l) => isProductKind(l.product!.kind) && isDownloadable(l.product!.kind, l.product_id)
  );
  const aRemettre = items.filter((l) => !aTelecharger.includes(l));
  const groupes = [
    { cle: "cart.group.download" as const, lignes: aTelecharger, escrow: false },
    { cle: "cart.group.handover" as const, lignes: aRemettre, escrow: true },
  ].filter((g) => g.lignes.length > 0);
  const montrerEntetes = groupes.length > 1;

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
            className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-on-brand"
          >
            {t(lang, "nav.catalog")}
          </Link>
        </div>
      )}
      {!error && items.length > 0 && (
        <>
          {groupes.map((g) => (
            <section key={g.cle} className="mt-6">
              {montrerEntetes && (
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-mist">
                  {t(lang, g.cle)}
                </h2>
              )}
              {/* L'escrow, énoncé UNE fois, sur le groupe où il est vrai. */}
              {g.escrow && (
                <p className="mb-2 flex items-start gap-2 text-xs text-mist">
                  <svg
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    className="mt-0.5 h-4 w-4 flex-none fill-none stroke-success"
                    strokeWidth="1.8"
                  >
                    <path d="M4 8h16v11H4zM8 8V6a4 4 0 018 0v2" />
                  </svg>
                  {t(lang, "trust.2.b")}
                </p>
              )}
              <ul className="divide-y divide-line rounded-2xl border border-line bg-surface/40">
                {g.lignes.map((l) => (
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
            </section>
          ))}
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
