import { ProductCommitmentDetails } from "@/components/product-commitment-details";
import { getProductCommitments } from "@/lib/product-commitments-server";
import { marketplaceCopy } from "@/lib/marketplace-copy";
import Link from "next/link";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { RemoveFromCart } from "@/components/remove-from-cart";
import { createClient } from "@/lib/supabase/server";
import { formatHTG } from "@/lib/sample-data";
import { getLang } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";
import { isProductKind, isDownloadable } from "@/lib/product-kind";
import { createAdminClient } from "@/lib/supabase/admin";
import { CartPayAll, type OptionPanier } from "@/components/cart-pay-all";
import { isStripeEnabled } from "@/lib/stripe";
import { isKobaraEnabled } from "@/lib/kobara";
import { usdCentsFromHtg, formatUsd } from "@/lib/payment-utils";
import type { Lang } from "@/lib/i18n";
import { CardImage } from "@/components/card-image";
import { coverUrlAt } from "@/lib/product-image";
import { hrefBoutique } from "@/lib/boutique-href";

export const dynamic = "force-dynamic";

/* Titre d'onglet dans la langue de l'acheteur : il était écrit en dur
 * (« Mon panier — Zabelie ») pour un produit kreyòl d'abord. `noindex`
 * reste : un panier est une page privée. */
export async function generateMetadata() {
  const lang = await getLang();
  return { title: `${t(lang, "cart.title")} — Zabelie`, robots: { index: false, follow: false } };
}

/* Vignette de ligne : un carré de 64 px, comme Etsy et Amazon, dimensions
 * posées (aucun saut de mise en page) et chargement différé (`CardImage`).
 * Quand les transformations d'image sont actives (`lib/product-image.ts`),
 * la source est demandée au double (écrans 2×) et non à la largeur d'une
 * carte de catalogue (640 px) ; sans elles, l'URL d'origine est servie. */
const VIGNETTE = 64;
const VIGNETTE_SOURCE = VIGNETTE * 2;

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
        <p className="mt-4 text-sm text-mist">{t(lang, "cart.login.b")}</p>
        <Link
          href={`/connexion?next=${encodeURIComponent("/panier")}`}
          className="bouton mt-4 inline-flex min-h-11 items-center rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-on-brand"
        >
          {t(lang, "nav.login")}
        </Link>
      </Coquille>
    );
  }

  const { data: lignes, error } = await supabase
    .from("zabelie_cart_items")
    .select(
      "product_id, added_at, product:products(slug, title, price_htg, kind, cover_url, seller_id, creator:profiles!products_seller_id_fkey(display_name))"
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
      cover_url: string | null;
      seller_id: string;
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
  const commitments = await getProductCommitments(aRemettre.map(l => l.product_id));
  const trustLabels = marketplaceCopy(lang);
  const groupes = [
    { cle: "cart.group.download" as const, lignes: aTelecharger, escrow: false },
    { cle: "cart.group.handover" as const, lignes: aRemettre, escrow: true },
  ].filter((g) => g.lignes.length > 0);
  const montrerEntetes = groupes.length > 1;

  /* PAIEMENT GROUPÉ (0128) — derrière le drapeau EN BASE, lu à chaque rendu.
   * Fermé si la table est illisible (migration absente, incident) : le
   * panier retombe alors exactement sur le paiement article par article. */
  const config = items.length > 1 ? await lirePanierConfig() : null;
  const payerTout =
    config !== null &&
    items.length <= config.max_articles &&
    items.every((l) => (l.product?.price_htg ?? 0) > 0);
  const optionsGroupe = payerTout
    ? optionsPanier(lang, total, items.map((l) => l.product!.price_htg))
    : [];

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
            className="bouton mt-4 inline-flex min-h-11 items-center rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-on-brand"
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
              {/* PAR BOUTIQUE, comme Etsy : à l'intérieur d'un mode de remise,
                  une carte par vendeur, son nom UNE fois en tête au lieu de
                  « par … » sous chaque ligne. Présentation seule : les mêmes
                  lignes, dans le même ordre d'ajout, et aucun montant ne
                  change. */}
              <div className="grid gap-3">
                {parBoutique(g.lignes).map((b) => (
                  <div key={b.vendeurId} className="rounded-2xl border border-line bg-surface/40">
                    {b.nom && (
                      <p className="flex items-center gap-2 border-b border-line px-4 text-sm text-mist">
                        <svg
                          viewBox="0 0 24 24"
                          aria-hidden="true"
                          className="h-4 w-4 flex-none fill-none stroke-current"
                          strokeWidth="1.8"
                        >
                          <path d="M4 10h16M5 10V20h14V10M3 10l2-6h14l2 6M10 20v-5h4v5" />
                        </svg>
                        <span>{t(lang, "product.by")}</span>
                        <Link
                          href={hrefBoutique({ id: b.vendeurId, boutikSlug: null })}
                          className="inline-flex min-h-11 min-w-0 items-center font-semibold text-cloud transition hover:text-accent"
                        >
                          <span className="truncate">{b.nom}</span>
                        </Link>
                      </p>
                    )}
                    <ul className="divide-y divide-line">
                      {b.lignes.map((l) => {
                        const vignette = coverUrlAt(l.product!.cover_url, VIGNETTE_SOURCE);
                        return (
                          <li key={l.product_id} className="flex gap-3 p-4">
                            {/* La vignette mène à la fiche, comme le titre ; hors
                                de l'ordre de tabulation et du lecteur d'écran,
                                pour ne pas annoncer deux fois le même lien. */}
                            <Link
                              href={`/produit/${l.product!.slug}`}
                              tabIndex={-1}
                              aria-hidden="true"
                              className="relative block h-16 w-16 flex-none overflow-hidden rounded-lg bg-line"
                            >
                              {vignette ? (
                                <CardImage src={vignette} alt="" size={VIGNETTE} />
                              ) : (
                                // Pas de photo : un aplat neutre et l'icône du
                                // produit, jamais une image de remplissage qui
                                // ferait croire à la marchandise.
                                <span className="flex h-full w-full items-center justify-center text-mist">
                                  <svg viewBox="0 0 48 48" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                                    <path d="M12 16h24l3 25H9l3-25Z" />
                                    <path d="M18 17v-5a6 6 0 0 1 12 0v5" />
                                  </svg>
                                </span>
                              )}
                            </Link>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-3">
                                <Link
                                  href={`/produit/${l.product!.slug}`}
                                  className="line-clamp-2 break-words font-semibold text-cloud transition hover:text-accent"
                                >
                                  {l.product!.title}
                                </Link>
                                {/* Même orange de texte que la carte produit
                                    (`text-accent`) : un prix se reconnaît d'une
                                    page à l'autre. */}
                                <span className="numeric shrink-0 font-bold text-accent">
                                  {formatHTG(l.product!.price_htg)}
                                </span>
                              </div>
                              <div className="mt-3 flex flex-wrap items-start gap-3">
                                <Link href={`/produit/${l.product!.slug}`} className="bouton inline-flex min-h-11 items-center rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-on-brand">{trustLabels.checkPay}</Link>
                                <RemoveFromCart
                                  productId={l.product_id}
                                  labels={{
                                    remove: t(lang, "cart.remove"),
                                    aria: t(lang, "cart.remove.aria", { title: l.product!.title }),
                                    error: t(lang, "cart.remove.error", { title: l.product!.title }),
                                    offline: t(lang, "cart.remove.offline", { title: l.product!.title }),
                                    retry: t(lang, "offline.retry"),
                                  }}
                                />
                              </div>
                              {g.escrow && <div className="mt-3"><ProductCommitmentDetails value={commitments?.get(l.product_id)} labels={trustLabels} locale={lang === "ht" ? "fr-HT" : lang} href={`/produit/${l.product!.slug}#contacter-vendeur`}/></div>}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            </section>
          ))}
          <div className="mt-4 flex items-center justify-between rounded-2xl border border-line bg-surface/40 px-4 py-3">
            <span className="text-sm font-semibold text-mist">{t(lang, "cart.total")}</span>
            <span className="numeric text-xl font-extrabold text-accent">
              {formatHTG(total)}
            </span>
          </div>
          {payerTout ? (
            <>
              <CartPayAll
                options={optionsGroupe}
                labels={{
                  title: t(lang, "cart.pay.all.title"),
                  note: t(lang, "cart.pay.all.note", { n: String(items.length) }),
                  coupon: t(lang, "cart.pay.all.coupon"),
                  loading: t(lang, "cart.pay.all.loading"),
                  error: t(lang, "cart.pay.all.error"),
                  network: t(lang, "error.network"),
                  age: t(lang, "cart.pay.all.age"),
                  stalled: t(lang, "cart.pay.all.stalled"),
                  reload: t(lang, "cart.pay.all.reload"),
                }}
              />
              <p className="mt-3 text-center text-xs text-mist">{t(lang, "cart.note.group")}</p>
            </>
          ) : (
            <p className="mt-3 text-center text-xs text-mist">{t(lang, "cart.note")}</p>
          )}
        </>
      )}
    </Coquille>
  );
}

async function lirePanierConfig(): Promise<{ max_articles: number } | null> {
  try {
    const admin = createAdminClient();
    // Même question que la route : la base décide (0128).
    const [{ data: ouvert, error: e1 }, { data, error: e2 }] = await Promise.all([
      admin.rpc("zabelie_panier_groupe_ouvert"),
      admin.from("zabelie_panier_config").select("max_articles").maybeSingle(),
    ]);
    if (e1 || e2 || !data || ouvert !== true) return null;
    return { max_articles: data.max_articles };
  } catch {
    return null;
  }
}

/**
 * Les lignes d'un groupe, rangées PAR BOUTIQUE (vendeur), dans l'ordre où la
 * première ligne de chaque boutique apparaît. Présentation seule : chaque
 * ligne ressort une fois et une seule, telle quelle ; rien n'est additionné.
 */
function parBoutique<L extends { product: { seller_id: string; creator: { display_name: string | null } | null } | null }>(
  lignes: L[]
): { vendeurId: string; nom: string | null; lignes: L[] }[] {
  const boutiques = new Map<string, { vendeurId: string; nom: string | null; lignes: L[] }>();
  for (const l of lignes) {
    const vendeurId = l.product!.seller_id;
    const b = boutiques.get(vendeurId);
    if (b) b.lignes.push(l);
    else boutiques.set(vendeurId, { vendeurId, nom: l.product!.creator?.display_name ?? null, lignes: [l] });
  }
  return [...boutiques.values()];
}

/** Les rails du paiement groupé, dans l'ordre de la fiche produit. Zelle n'y
 *  est pas : semi-manuel, il ne sait pas confirmer un groupe (bientôt). */
function optionsPanier(lang: Lang, total: number, prix: number[]): OptionPanier[] {
  const price = formatHTG(total);
  const options: OptionPanier[] = [{ rail: "moncash", label: t(lang, "product.pay", { price }) }];
  if (isKobaraEnabled()) {
    options.push({ rail: "kobara", kobaraProvider: "natcash", label: t(lang, "product.pay.natcash", { price }) });
    if (process.env.KOBARA_MONCASH?.trim() === "true") {
      options.push({ rail: "kobara", kobaraProvider: "moncash", label: t(lang, "product.pay.kobara.moncash", { price }) });
    }
  }
  const rate = Number(process.env.USD_HTG_RATE);
  if (isStripeEnabled() && Number.isFinite(rate) && rate > 0) {
    // La somme des montants USD PAR ARTICLE : c'est ce que le serveur scelle.
    const usd = formatUsd(prix.reduce((n, p) => n + usdCentsFromHtg(p, rate), 0));
    options.push({ rail: "stripe", label: t(lang, "product.pay.stripe", { usd }) });
  }
  return options;
}

function Coquille({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <div className="bg-grain min-h-dvh">
      <SiteNav />
      <main id="main" className="mx-auto max-w-3xl px-5 py-16">
        <h1 className="text-3xl font-extrabold tracking-tight">{titre}</h1>
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
