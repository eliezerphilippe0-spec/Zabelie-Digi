import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { formatHTG } from "@/lib/sample-data";
import { getProductView, isSupabaseConfigured } from "@/lib/products";
import { createClient } from "@/lib/supabase/server";
import { listerMedias } from "@/lib/product-media";
import { lireComparePrix, pourcentageRabais } from "@/lib/product-discount";
import { GalerieProduit } from "@/components/galerie-produit";
import { getProductReviews } from "@/lib/reviews";
import { offreFlashActive } from "@/lib/flash";
import { FlashCountdown } from "@/components/flash-countdown";
import { BuyButton, type BuyOption } from "@/components/buy-button";
import { AddToCart } from "@/components/add-to-cart";
import { getPhysicalView } from "@/lib/products-physical";
import { isStripeEnabled } from "@/lib/stripe";
import { isZelleEnabled } from "@/lib/zelle";
import { usdCentsFromHtg, formatUsd } from "@/lib/payment-utils";
import { ShareButtons } from "@/components/share-buttons";
import { coverUrlAt, COVER_WIDTHS } from "@/lib/product-image";
import { getLang } from "@/lib/i18n-server";
import { t, type Lang } from "@/lib/i18n";
import {
  kindLabelKey,
  deliveryBulletKey as bulletKey,
  deliveryNoticeKey,
  isService,
} from "@/lib/product-kind";

export const dynamic = "force-dynamic";

/**
 * Aperçu de partage — la fiche produit est diffusée par lien WhatsApp, donc
 * cette carte EST la page d'accueil de la plupart des acheteurs.
 *
 * L'image (1200×630) était déjà générée par produit (opengraph-image.tsx),
 * mais rien ne définissait le titre ni la description : ils retombaient sur
 * ceux du layout racine, identiques pour toutes les fiches. Un lien partagé
 * s'annonçait « Zabelie — La marketplace haïtienne » au lieu du produit et de
 * son prix — et l'onglet du navigateur affichait la même chose partout.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductView(slug).catch(() => undefined);
  if (!product) return { title: "Produit introuvable — Zabelie" };

  const price = formatHTG(product.priceHTG);
  const title = `${product.title} — ${price}`;
  // Le prix et le vendeur AVANT le descriptif : c'est ce qui décide le clic
  // dans un fil de discussion, et WhatsApp tronque tôt.
  const blurb = product.blurb.replace(/\s+/g, " ").trim();
  const description = `${price} · par ${product.creator}${blurb ? ` — ${blurb}` : ""}`;

  return {
    title,
    description: description.length > 200 ? description.slice(0, 197) + "…" : description,
    alternates: { canonical: `/produit/${product.slug}` },
    openGraph: {
      title,
      description,
      type: "website",
      url: `/produit/${product.slug}`,
      siteName: "Zabelie",
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

/**
 * Rails proposés, construits côté serveur : MonCash toujours, puis les rails
 * diaspora USD si configurés (Stripe/Zelle + USD_HTG_RATE). Le prix USD affiché
 * est indicatif — la vérité reste figée au checkout puis vérifiée en base.
 */
// `Lang`, jamais l'union recopiée à la main : c'est cette recopie qui a fait
// échouer la compilation à l'ajout de l'anglais. Ici le compilateur a bien
// énuméré le site — parce que la valeur qui entre EST un `Lang`. Un
// `lang as "fr" | "ht"` serait passé en silence.
function buildBuyOptions(lang: Lang, priceHTG: number): BuyOption[] {
  const options: BuyOption[] = [
    { rail: "moncash", label: t(lang, "product.pay", { price: formatHTG(priceHTG) }) },
  ];
  const rate = Number(process.env.USD_HTG_RATE);
  if (Number.isFinite(rate) && rate > 0) {
    const usd = formatUsd(usdCentsFromHtg(priceHTG, rate));
    if (isStripeEnabled()) {
      options.push({ rail: "stripe", label: t(lang, "product.pay.stripe", { usd }) });
    }
    if (isZelleEnabled()) {
      options.push({ rail: "zelle", label: t(lang, "product.pay.zelle", { usd }) });
    }
  }
  return options;
}

/**
 * Équivalent USD indicatif pour la diaspora (taux public USD_HTG_RATE).
 * Affichage seulement — le montant payé reste la vérité serveur.
 */
function usdHint(priceHTG: number): string | null {
  const rate = Number(process.env.USD_HTG_RATE);
  if (!Number.isFinite(rate) || rate <= 0) return null;
  return formatUsd(usdCentsFromHtg(priceHTG, rate));
}

function Stars({ value }: { value: number }) {
  return (
    <span aria-label={`${value} sur 5`} className="text-accent">
      {"★".repeat(Math.round(value))}
      <span className="text-mist">{"★".repeat(5 - Math.round(value))}</span>
    </span>
  );
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [product, lang] = await Promise.all([getProductView(slug), getLang()]);
  if (!product) notFound();

  const [reviews, physical, medias, compareHtg, flash] = await Promise.all([
    product.creatorId ? getProductReviews(product.id) : Promise.resolve([]),
    getPhysicalView(product.id),
    // Galerie V-1A — [] en démo, [] tant que 0073 n'est pas appliquée.
    isSupabaseConfigured()
      ? createClient().then((c) => listerMedias(c, product.id))
      : Promise.resolve([]),
    // Rabais V-4 — null en démo, null tant que 0075 n'est pas appliquée.
    isSupabaseConfigured()
      ? createClient().then((c) => lireComparePrix(c, product.id))
      : Promise.resolve(null),
    // Vente flash (0080) — null en démo, null tant que 0080 n'est pas appliquée.
    isSupabaseConfigured()
      ? createClient().then((c) => offreFlashActive(c, product.id))
      : Promise.resolve(null),
  ]);

  const kindKey = kindLabelKey(product.kind, product.id);
  const deliveryBulletKey = bulletKey(product.kind, product.id);
  // La zone de livraison n'a pas encore de colonne : seul le repli « à
  // convenir » est atteignable aujourd'hui pour un produit physique.
  const delivery = deliveryNoticeKey(
    product.kind,
    { zone: null, days: product.deliveryDays },
    product.id
  );

  return (
    <div className="bg-grain min-h-screen">
      <SiteNav />

      <section className="mx-auto grid max-w-6xl gap-10 px-5 pb-16 pt-12 lg:grid-cols-2">
        {/* Visuel — la photo du vendeur si elle existe, sinon le dégradé.
            `cover_url` existait depuis 0001 et l'upload depuis 0039, mais
            aucune surface ne la lisait : le vendeur téléversait une photo
            qu'aucun acheteur ne voyait. Sur une marketplace, la photo EST le
            produit. Redimensionnée au CDN Supabase (lib/product-image), pas
            au rendu : aucun quota Vercel, ~40 Ko au lieu de 5 Mo. */}
        <div>
          {coverUrlAt(product.coverUrl, COVER_WIDTHS.detail) || medias.length > 0 ? (
            /* V-1A (docs/35) : la galerie RÉELLE — l'inverse exact des
               vignettes factices retirées par BL-119. Sans 0073 appliquée,
               `medias` est vide et le rendu est la couverture seule,
               exactement comme avant. */
            <GalerieProduit
              couverture={coverUrlAt(product.coverUrl, COVER_WIDTHS.detail)}
              medias={medias.filter((m) => m.kind === "image").map((m) => m.url)}
              video={medias.find((m) => m.kind === "video")?.url ?? null}
              alt={product.title}
            />
          ) : (
            <div
              className={`aspect-[4/3] w-full rounded-3xl bg-gradient-to-br ${product.accent}`}
            />
          )}
        </div>

        {/* Infos + achat */}
        <div className="flex flex-col">
          <Link
            href="/catalogue"
            className="text-sm text-mist hover:text-cloud"
          >
            {t(lang, "product.back")}
          </Link>

          <div className="mt-4 flex items-center gap-2">
            {kindKey && (
              <span className="rounded-full border border-line px-3 py-1 text-xs text-mist">
                {t(lang, kindKey)}
              </span>
            )}
            <span className="rounded-full border border-line px-3 py-1 text-xs text-mist">
              {product.category}
            </span>
            {/* `!= null` et non truthy : 0 (« le jour même ») est une
                valeur MOINS un manque — le test truthy le masquait. */}
            {isService(product.kind, product.id) && product.deliveryDays != null && (
              <span className="rounded-full border border-line px-3 py-1 text-xs text-accent">
                ⏱{" "}
                {product.deliveryDays === 0
                  ? t(lang, "product.delivery.sameday")
                  : t(lang, "product.delivery.days", {
                      days: String(product.deliveryDays),
                    })}
              </span>
            )}
          </div>

          <h1 className="mt-4 text-3xl font-extrabold leading-tight tracking-tight">
            {product.title}
          </h1>
          <p className="mt-3 text-mist">{product.blurb}</p>

          {isService(product.kind, product.id) && product.serviceIncludes.length > 0 && (
            <div className="mt-4 rounded-2xl border border-line bg-surface/40 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-mist">
                {t(lang, "product.includes")}
              </p>
              <ul className="mt-2 space-y-1.5 text-sm">
                {product.serviceIncludes.map((item, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="mt-0.5 text-accent">✓</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-mist">
            {product.creatorId ? (
              <Link
                href={`/createur/${product.creatorId}`}
                className="hover:text-cloud"
              >
                {t(lang, "product.by")} {product.creator}
              </Link>
            ) : (
              <span>{t(lang, "product.by")} {product.creator}</span>
            )}
            {product.ratingAvg !== null && (
              <span>
                <Stars value={product.ratingAvg} /> {product.ratingAvg} (
                {product.ratingCount} {t(lang, "product.reviews.badge")})
              </span>
            )}
            {product.sales > 0 && (
              <span>
                {product.sales} {t(lang, "product.sales")}
              </span>
            )}
          </div>

          <div id="acheter" className="mt-8 scroll-mt-24 rounded-2xl border border-line bg-surface/60 p-6">
            {/* Rabais V-4 : l'ancien prix barré est un prix RÉELLEMENT
                pratiqué (contrainte + RPC de 0075 — jamais une saisie libre). */}
            {/* Vente flash (0080) : prime sur le rabais — deux barrés
                empilés seraient deux vérités. Le prix FAIT FOI au serveur du
                checkout ; ceci est l'étalage. */}
            {flash ? (
              <p className="flex flex-wrap items-center gap-2 text-sm text-mist">
                <span className="rounded-full bg-brand px-2 py-0.5 text-xs font-bold text-ink">
                  {t(lang, "product.flash.badge")}
                </span>
                <span className="line-through">{formatHTG(product.priceHTG)}</span>
                <FlashCountdown fin={flash.fin} prefix={t(lang, "product.flash.ends")} />
              </p>
            ) : (
              compareHtg &&
              compareHtg > product.priceHTG && (
                <p className="text-sm text-mist">
                  <span className="line-through">{formatHTG(compareHtg)}</span>
                  <span className="ml-2 rounded-full border border-brand px-2 py-0.5 text-xs font-bold text-brand">
                    −{pourcentageRabais(compareHtg, product.priceHTG)}%
                  </span>
                </p>
              )
            )}
            <p className="numeric text-3xl font-extrabold text-gradient">
              {formatHTG(flash ? flash.prixFlashHtg : product.priceHTG)}
              {usdHint(product.priceHTG) && (
                <span className="ml-2 align-middle text-base font-semibold text-mist">
                  ≈ {usdHint(product.priceHTG)}
                </span>
              )}
            </p>
            {/* Preuve sociale À CÔTÉ du prix : c'est là que l'hésitation se joue. */}
            {(product.ratingAvg !== null || product.sales > 0) && (
              <p className="mt-1 text-xs text-mist">
                {product.ratingAvg !== null && (
                  <>
                    <span className="text-accent">★</span> {product.ratingAvg} (
                    {product.ratingCount} {t(lang, "product.reviews.badge")})
                  </>
                )}
                {product.ratingAvg !== null && product.sales > 0 && " · "}
                {product.sales > 0 && (
                  <>
                    {product.sales} {t(lang, "product.sales")}
                  </>
                )}
              </p>
            )}
            <div className="mt-5">
              <BuyButton
                productId={product.id}
                variants={physical?.variants}
                stockLabels={{
                  chooseVariant: "Choisir",
                  outOfStock: "Rupture de stock",
                  lastUnits: "Plus que {n} en stock",
                  inStock: "{n} en stock",
                  variantOut: "Indisponible",
                }}
                options={buildBuyOptions(lang, product.priceHTG)}
                othersLabel={t(lang, "pay.other")}
                loadingLabel={t(lang, "pay.redirect")}
                coupon={{
                  have: t(lang, "coupon.have"),
                  placeholder: t(lang, "coupon.ph"),
                  apply: t(lang, "coupon.apply"),
                  applied: t(lang, "coupon.applied"),
                  invalid: t(lang, "coupon.invalid"),
                }}
                errors={{
                  generic: t(lang, "error.generic"),
                  network: t(lang, "error.network"),
                  provider: t(lang, "error.provider"),
                }}
              />
              {/* Le panier ne remplace pas l'achat direct : il ajoute le cas
                  « je prends plusieurs choses ». Bouton secondaire, sous le
                  primaire — la hiérarchie dit le chemin recommandé. */}
              <AddToCart
                productId={product.id}
                labels={{
                  add: t(lang, "cart.add"),
                  adding: t(lang, "cart.adding"),
                  added: t(lang, "cart.added"),
                  seeCart: t(lang, "cart.see"),
                  signin: t(lang, "nav.login"),
                  error: t(lang, "error.generic"),
                }}
              />
            </div>
            {/* Mention de livraison — dépend du type. Elle était affichée
                inconditionnellement (« Livraison instantanée après
                confirmation du paiement »), y compris sur un produit
                physique. Sur un produit physique, elle attribue explicitement
                l'information au vendeur : Zabelie ne livre pas. */}
            {delivery && (
              <p className="mt-3 text-center text-xs text-mist">
                {t(lang, delivery.key, delivery.params)}
              </p>
            )}
          </div>

          {/* Compatibilité véhicule — décisif sur une pièce détachée :
              l'acheteur a déjà payé quand il découvre l'erreur de référence.
              Bloc À PART, juste sous le prix : ce n'est pas une ligne de
              réassurance, c'est un fait qui décide l'achat. Il était imbriqué
              dans un <li> de la liste ci-dessous, avec le texte de livraison
              coupé en deux autour — balisage invalide (un <ul> dans un <li>
              d'une autre liste) et ordre de lecture faux. */}
          {physical && physical.fitment.length > 0 && (
            <div className="mt-6 rounded-2xl border border-brand/40 bg-surface/50 p-5">
              <p className="text-sm font-semibold">Compatible avec</p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {physical.fitment.map((f, i) => (
                  <li
                    key={i}
                    className="rounded-full border border-line px-3 py-1 text-xs text-cloud"
                  >
                    {f.kind === "moto" ? "🏍 " : "🚗 "}
                    {f.make} {f.model} · {f.yearStart}
                    {f.yearEnd ? `–${f.yearEnd}` : "+"}
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-mist">
                Vérifiez votre modèle avant d&apos;acheter. En cas de doute,
                contactez le vendeur.
              </p>
            </div>
          )}

          {/* ── Caractéristiques (V-2, docs/35) — seulement ce qui est
                 RENSEIGNÉ : pas de ligne vide, pas de tiret décoratif. ── */}
          {physical?.specs && (
            <div className="mt-6 rounded-2xl border border-line bg-surface/40 p-4">
              <h2 className="text-sm font-semibold text-cloud">
                {t(lang, "product.specs.title")}
              </h2>
              <dl className="mt-2 space-y-1 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-mist">{t(lang, "product.specs.weight")}</dt>
                  <dd>{physical.specs.weightGrams} g</dd>
                </div>
                {physical.specs.lengthMm &&
                  physical.specs.widthMm &&
                  physical.specs.heightMm && (
                    <div className="flex justify-between gap-4">
                      <dt className="text-mist">{t(lang, "product.specs.dims")}</dt>
                      <dd>
                        {Math.round(physical.specs.lengthMm / 10)} ×{" "}
                        {Math.round(physical.specs.widthMm / 10)} ×{" "}
                        {Math.round(physical.specs.heightMm / 10)} cm
                      </dd>
                    </div>
                  )}
                {physical.specs.brand && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-mist">{t(lang, "sell.specs.brand")}</dt>
                    <dd>{physical.specs.brand}</dd>
                  </div>
                )}
                {physical.specs.material && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-mist">{t(lang, "sell.specs.material")}</dt>
                    <dd>{physical.specs.material}</dd>
                  </div>
                )}
                {physical.specs.condition && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-mist">{t(lang, "sell.specs.condition")}</dt>
                    <dd>
                      {t(
                        lang,
                        physical.specs.condition === "nef"
                          ? "specs.condition.nef"
                          : "specs.condition.dezyem"
                      )}
                    </dd>
                  </div>
                )}
                {physical.specs.fragile && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-mist">{t(lang, "product.specs.fragile")}</dt>
                    <dd>✓</dd>
                  </div>
                )}
              </dl>
            </div>
          )}

          <ul className="mt-6 space-y-2 text-sm text-mist">
            <li>{t(lang, "product.secure")}</li>
            {/* Ligne de mode de remise. Absente sur un produit physique : la
                mention de livraison sous le prix dit déjà ce que le vendeur
                déclare, et rien d'autre n'est vrai — Zabelie ne livre pas.
                Aucune seconde formulation inventée ici. */}
            {deliveryBulletKey && <li>{t(lang, deliveryBulletKey)}</li>}
            <li>{t(lang, "product.verifiedOnly")}</li>
          </ul>

          <div className="mt-6">
            <ShareButtons
              path={`/produit/${product.slug}`}
              text={`${product.title} — ${formatHTG(product.priceHTG)} ${t(lang, "product.share")}`}
              waLabel={t(lang, "share.wa")}
              copyLabel={t(lang, "share.copy")}
              copiedLabel={t(lang, "share.copied")}
            />
          </div>
        </div>
      </section>

      {/* Avis vérifiés */}
      {reviews.length > 0 && (
        <section className="mx-auto max-w-6xl px-5 pb-16">
          <h2 className="text-lg font-semibold">
            {t(lang, "product.reviews")} ({reviews.length})
          </h2>
          <p className="mt-1 text-xs text-mist">
            {t(lang, "product.reviews.note")}
          </p>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {reviews.map((r) => (
              <li
                key={r.id}
                className="rounded-2xl border border-line bg-surface/60 p-4"
              >
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{r.buyerName}</span>
                  <Stars value={r.rating} />
                </div>
                {r.comment && (
                  <p className="mt-2 text-sm text-mist">{r.comment}</p>
                )}
                <p className="mt-2 text-xs text-mist">
                  {new Date(r.createdAt).toLocaleDateString("fr-HT")} ·{" "}
                  {t(lang, "product.verified")}
                </p>
              </li>
            ))}
          </ul>

          {/* CTA bas de page (règle Gumroad) : le lecteur convaincu par les
              avis ne doit pas remonter chercher le bouton. Ancre, pas un
              second checkout — un seul point d'achat, zéro état dupliqué. */}
          <div className="mt-8 text-center">
            <a
              href="#acheter"
              className="inline-block rounded-xl bg-brand px-8 py-3 text-sm font-semibold text-ink transition hover:opacity-90"
            >
              {t(lang, "product.cta.bottom", { price: formatHTG(product.priceHTG) })}
            </a>
          </div>
        </section>
      )}

      <SiteFooter />
    </div>
  );
}
