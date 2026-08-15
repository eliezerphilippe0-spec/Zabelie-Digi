import Link from "next/link";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { PublishForm } from "@/components/publish-form";
import { UploadAsset } from "@/components/upload-asset";
import { createClient } from "@/lib/supabase/server";
import { lireRayonsPublication } from "@/lib/product-categories";
import { isSupabaseConfigured } from "@/lib/products";
import { getLang } from "@/lib/i18n-server";
import { isPrefetch, logLanding } from "@/lib/metrics";
import { t, type Lang } from "@/lib/i18n";
import type { ProductKind } from "@/lib/sample-data";
import { isDownloadable, kindLabelKey } from "@/lib/product-kind";
import { ROUNDING_IN_FORCE, type CreatorTier } from "@/lib/commission";
import { lireTauxCommission } from "@/lib/commission-config";
import { POLICY_PATH } from "@/lib/policy";
import { aiProviderDisponible } from "@/lib/ai-description";
import { tarifSurplusAffiche } from "@/lib/ai-billing";
import { createAdminClient } from "@/lib/supabase/admin";
import { listerMedias, MAX_IMAGES_PER_PRODUCT } from "@/lib/product-media";
import { GalerieManager } from "@/components/galerie-manager";
import { lireCompares } from "@/lib/product-discount";
import { RabaisManager } from "@/components/rabais-manager";

export const dynamic = "force-dynamic";
export const metadata = { title: "Vendre — Zabelie" };

function Shell({
  children,
  lang,
  subtitle,
}: {
  children: React.ReactNode;
  lang: Lang;
  subtitle?: string;
}) {
  return (
    <div className="bg-grain min-h-screen">
      <SiteNav />
      <main className="mx-auto max-w-lg px-5 py-16">
        <h1 className="text-3xl font-extrabold tracking-tight">{t(lang, "sell.title")}</h1>
        {subtitle && <p className="mt-2 text-sm text-mist">{subtitle}</p>}
        {/* Ces deux liens vivent dans le Shell : ils sont donc présents AUSSI
            sur l'écran de connexion vendeur et en mode démo — c'est-à-dire aux
            deux endroits où un vendeur arrive avant d'avoir un compte. Placés
            plus bas, dans la branche authentifiée, ils manquaient exactement
            là où on cherche à s'orienter. */}
        <p className="mt-2 text-xs">
          <Link href={POLICY_PATH} className="text-mist underline hover:text-cloud">
            {t(lang, "policy.link")}
          </Link>
        </p>
        <div className="mt-5 rounded-2xl border border-line bg-surface/40 p-5">
          <p className="text-sm text-cloud">{t(lang, "sell.physical.q")}</p>
          <Link
            href="/vendre/physique"
            className="mt-3 inline-block rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-ink"
          >
            {t(lang, "sell.physical.cta")}
          </Link>
        </div>
        <div className="mt-8">{children}</div>
      </main>
      <SiteFooter />
    </div>
  );
}

export default async function VendrePage() {
  const lang = await getLang();
  // Mesure : arriver ici EST le signal « CTA vendeur » — tous les chemins
  // (topbar, slide 3, rail, section finale) convergent sur cette page, et le
  // serveur le voit sans un octet de JS. Garde préchargement : un survol de
  // lien n'est pas un clic.
  if (!(await isPrefetch())) logLanding("sell_cta_clicked");

  if (!isSupabaseConfigured()) {
    return (
      <Shell lang={lang} subtitle={t(lang, "sell.demo.subtitle")}>
        <div className="glass rounded-2xl p-6 text-sm text-mist">
          {t(lang, "sell.demo.body.pre")}
          <code className="mx-1 text-cloud">supabase/README.md</code>
          {t(lang, "sell.demo.body.post")}
        </div>
      </Shell>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <Shell lang={lang} subtitle={t(lang, "sell.login.subtitle")}>
        <Link
          href="/connexion?next=/vendre"
          className="inline-block rounded-xl bg-brand px-6 py-3 text-sm font-semibold text-ink"
        >
          {t(lang, "auth.signin.cta")}
        </Link>
      </Shell>
    );
  }

  // Palier du vendeur : il détermine le taux annoncé sous le champ prix.
  // Lu en base et jamais deviné — mais la colonne peut manquer sur une base
  // en retard de migration, et une estimation d'affichage ne doit pas faire
  // tomber la page de publication. Repli sur le palier standard, qui est
  // aujourd'hui celui de TOUS les vendeurs (aucun chemin n'attribue elite).
  const { data: profile } = await supabase
    .from("profiles")
    .select("tier")
    .eq("id", user.id)
    .maybeSingle();
  const tier: CreatorTier =
    (profile as { tier?: string } | null)?.tier === "elite" ? "elite" : "standard";

  // Les rayons OUVERTS, lus en base : le vendeur publie désormais dans la
  // MÊME taxonomie que celle qu'affichent le menu, la colonne des rayons et
  // le catalogue (correctif 2026-08-11 — voir lib/product-categories).
  const rayonsPublication = await lireRayonsPublication(supabase, lang);
  // Le tarif du surplus IA, affiché D'EMBLÉE sous le bouton d'aide — lu en
  // base (quota et prix suivent un UPDATE sans redéploiement), absent tant
  // que l'aide est éteinte ou 0071 non appliquée.
  const aiTarif = aiProviderDisponible()
    ? await tarifSurplusAffiche(createAdminClient(), lang)
    : undefined;
  // Le taux RÉELLEMENT configuré (0054/0066), pour que l'estimation suive
  // un UPDATE d'exploitation sans redéploiement. Repli = constante compilée.
  const { taux } = await lireTauxCommission(supabase, (c) =>
    console.error("[commission] taux de repli utilisé", c),
  );

  const { data: mineRaw } = await supabase
    .from("products")
    .select("id, slug, title, status, kind, price_htg, product_assets(id)")
    .eq("seller_id", user.id)
    .order("created_at", { ascending: false });

  type MineRow = {
    id: string;
    slug: string;
    title: string;
    status: string;
    kind: ProductKind;
    price_htg: number;
    product_assets: { id: string }[];
  };
  const mine = (mineRaw ?? []) as unknown as MineRow[];

  // Galerie V-1A (docs/35) : l'état initial de chaque gestionnaire vient du
  // serveur — [] tant que 0073 n'est pas appliquée, et le gestionnaire
  // affiche alors l'erreur de la route au premier essai (503 explicite).
  const galeries = await Promise.all(
    mine.map((p) => listerMedias(supabase, p.id))
  );
  // Rabais V-4 : map vide tant que 0075 n'est pas appliquée.
  const compares = await lireCompares(supabase, user.id);
  const rabaisLabels = {
    title: t(lang, "sell.rabais.title"),
    newPh: t(lang, "sell.rabais.newPh"),
    apply: t(lang, "sell.rabais.apply"),
    remove: t(lang, "sell.rabais.remove"),
    hint: t(lang, "sell.rabais.hint"),
    error: t(lang, "sell.galerie.error"),
  };
  const galerieLabels = {
    title: t(lang, "sell.galerie.title"),
    add: t(lang, "sell.galerie.add"),
    sending: t(lang, "sell.galerie.sending"),
    remove: t(lang, "sell.galerie.remove"),
    hint: t(lang, "sell.galerie.hint").replace(
      "{max}",
      String(MAX_IMAGES_PER_PRODUCT)
    ),
    error: t(lang, "sell.galerie.error"),
    videoAdd: t(lang, "sell.galerie.video.add"),
    videoTooLong: t(lang, "sell.galerie.video.long"),
    videoTooBig: t(lang, "sell.galerie.video.big"),
  };
  // BL-130 (FRONT-14) : `status` est un mot-clé technique brut ("published")
  // — jamais affiché tel quel, toujours mappé sur un libellé FR/KR.
  //
  // « Brouillon » était exact et inutile : depuis que les trois types naissent
  // en brouillon et attendent une revue humaine, le vendeur qui ne voit rien
  // conclut que sa soumission a échoué — et resoumet. On récolterait des
  // doublons avant la première vente. Le libellé dit donc ce qui se passe.
  const statusLabel = (s: string) =>
    s === "published" ? t(lang, "status.published") : t(lang, "status.review");
  const uploadLabels = {
    sending: t(lang, "upload.sending"),
    replace: t(lang, "upload.replace"),
    add: t(lang, "upload.add"),
    saved: t(lang, "upload.saved"),
    error: t(lang, "upload.error"),
    errorNetwork: t(lang, "error.network"),
  };

  return (
    <Shell lang={lang} subtitle={t(lang, "sell.subtitle")}>

      <div className="glass rounded-2xl p-6">
        <PublishForm
          tier={tier}
          rateBpsEnVigueur={taux[tier]}
          aiActif={aiProviderDisponible() !== null}
          categories={rayonsPublication}
          labels={{
            titlePh: t(lang, "publish.title.ph"),
            kindAria: t(lang, "publish.kind.aria"),
            kindFile: t(lang, "product.kind.file"),
            kindService: t(lang, "product.kind.service"),
            categoryAria: t(lang, "publish.category.aria"),
            categoryEmpty: t(lang, "publish.category.empty"),
            pricePh: t(lang, "publish.price.ph"),
            descriptionPh: t(lang, "publish.description.ph"),
            serviceHint: t(lang, "publish.service.hint"),
            deliveryDaysPh: t(lang, "publish.deliveryDays.ph"),
            includesPh: t(lang, "publish.includes.ph"),
            includesAria: t(lang, "product.includes"),
            submit: t(lang, "publish.submit"),
            submitting: t(lang, "publish.submitting"),
            errorGeneric: t(lang, "publish.error.generic"),
            errorNetwork: t(lang, "error.network"),
            footerHint: t(lang, "publish.footer.hint"),
            net: {
              youReceive: t(lang, "publish.net.youReceive"),
              fee: t(lang, "publish.net.fee"),
              rounding: t(
                lang,
                ROUNDING_IN_FORCE === "floor"
                  ? "publish.net.rounding.floor"
                  : "publish.net.rounding",
              ),
              caveat: t(lang, "publish.net.caveat"),
            },
            policyAccept: t(lang, "policy.accept"),
            policyRead: t(lang, "policy.accept.read"),
            policyRequired: t(lang, "policy.accept.required"),
            ai: {
              button: t(lang, "ai.desc.button"),
              loading: t(lang, "ai.desc.loading"),
              error: t(lang, "ai.desc.error"),
              hint: t(lang, "ai.desc.hint"),
              needTitle: t(lang, "ai.desc.needTitle"),
              kwPh: t(lang, "ai.desc.kw.ph"),
              limit: t(lang, "ai.desc.limit"),
              surplus: t(lang, "ai.desc.surplus"),
              surplusGo: t(lang, "ai.desc.surplus.go"),
              tarif: aiTarif,
            },
          }}
        />
      </div>

      {mine.length > 0 && (
        <div className="mt-10">
          <h2 className="text-sm font-semibold text-cloud">{t(lang, "sell.mine.title")}</h2>
          {mine.some((p) => p.status !== "published") && (
            <p className="mt-2 text-xs text-mist">{t(lang, "status.review.hint")}</p>
          )}
          <ul className="mt-3 space-y-2">
            {mine.map((p, i) => (
              <li
                key={p.slug}
                className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface/60 px-4 py-3 text-sm"
              >
                <div className="min-w-0">
                  {/* Correctif audit : un produit brouillon (BL-103, fichier
                      sans livrable) n'est pas encore sur /produit/[slug]
                      (filtré status='published') — le lien y menait quand
                      même et tombait sur une 404 pour le vendeur. */}
                  {p.status === "published" ? (
                    <Link
                      href={`/produit/${p.slug}`}
                      className="block truncate hover:text-cloud"
                    >
                      {p.title}
                    </Link>
                  ) : (
                    <span className="block truncate">{p.title}</span>
                  )}
                  <span
                    className={
                      p.status === "published"
                        ? "text-xs text-mist"
                        : "text-xs font-semibold text-warning-text"
                    }
                  >
                    {statusLabel(p.status)}
                  </span>
                  <GalerieManager
                    productId={p.id}
                    initial={(galeries[i] ?? [])
                      .filter((m) => m.kind === "image")
                      .map((m) => ({ id: m.id, url: m.url }))}
                    initialVideo={(() => {
                      const v = (galeries[i] ?? []).find(
                        (m) => m.kind === "video"
                      );
                      return v ? { id: v.id, url: v.url } : null;
                    })()}
                    max={MAX_IMAGES_PER_PRODUCT}
                    labels={galerieLabels}
                  />
                  <RabaisManager
                    productId={p.id}
                    prixHtg={p.price_htg}
                    compareHtg={compares.get(p.id) ?? null}
                    labels={rabaisLabels}
                  />
                </div>
                {/* L'upload de livrable n'a de sens que pour un fichier. Le
                    `else` étiquetait « Service » tout le reste — un produit
                    physique s'affichait donc comme un service dans le
                    tableau de bord de son propre vendeur. */}
                {isDownloadable(p.kind, p.id) ? (
                  <UploadAsset
                    productId={p.id}
                    hasAsset={p.product_assets.length > 0}
                    labels={uploadLabels}
                  />
                ) : (
                  kindLabelKey(p.kind, p.id) && (
                    <span className="shrink-0 text-xs text-mist">
                      {t(lang, kindLabelKey(p.kind, p.id)!)}
                    </span>
                  )
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Shell>
  );
}
