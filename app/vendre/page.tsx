import { DigitalStudioEditor, DigitalDraftAction } from "@/components/digital-studio-editor";
import { studioLabels } from "@/lib/digital-studio-labels";
import type { DigitalStudio } from "@/lib/digital-studio";
import { DigitalDetailsEditor } from "@/components/digital-details-editor";
import { getDigitalDetails } from "@/lib/digital-details-server";
import Link from "next/link";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { sellerReadiness, type ReadinessProduct } from "@/lib/seller-readiness";
import { PublishForm } from "@/components/publish-form";
import { UploadAsset } from "@/components/upload-asset";
import { createClient } from "@/lib/supabase/server";
import { lireRayonsPublication, lireSousRayonsPublication } from "@/lib/product-categories";
import { isSupabaseConfigured } from "@/lib/products";
import { getLang } from "@/lib/i18n-server";
import { isPrefetch, logLanding } from "@/lib/metrics";
import { t, type Lang } from "@/lib/i18n";
import type { ProductKind } from "@/lib/sample-data";
import { isDownloadable, kindLabelKey } from "@/lib/product-kind";
import { ROUNDING_IN_FORCE, type CreatorTier } from "@/lib/commission";
import { lireTauxCommission } from "@/lib/commission-config";
import type { TauxCommission } from "@/lib/commission-config";
import { CommissionAnnonce } from "@/components/commission-annonce";
import { RATE_BPS } from "@/lib/commission";
import { POLICY_PATH } from "@/lib/policy";
import { horsProduction, signalerConfigAbsente } from "@/lib/diagnostic";
import { aiProviderDisponible } from "@/lib/ai-description";
import { tarifSurplusAffiche } from "@/lib/ai-billing";
import { createAdminClient } from "@/lib/supabase/admin";
import { listerMedias, MAX_IMAGES_PER_PRODUCT } from "@/lib/product-media";
import { GalerieManager } from "@/components/galerie-manager";
import { lireCompares } from "@/lib/product-discount";
import { RabaisManager } from "@/components/rabais-manager";
import { FlashManager } from "@/components/flash-manager";
import { lireOffresVivantes } from "@/lib/flash-vendeur";

export const dynamic = "force-dynamic";
export const metadata = { title: "Vendre — Zabelie" };

function Shell({
  children,
  lang,
  subtitle,
  taux,
}: {
  children: React.ReactNode;
  lang: Lang;
  subtitle?: string;
  /** Taux LU EN BASE (0054/0066) — jamais une constante de libellé. */
  taux: TauxCommission;
}) {
  return (
    <div className="bg-grain min-h-dvh">
      <SiteNav />
      <main id="main" className="mx-auto max-w-4xl px-5 py-16">
        <h1 className="text-3xl font-extrabold tracking-tight">{t(lang, "sell.title")}</h1>
        {subtitle && <p className="mt-2 text-sm text-mist">{subtitle}</p>}
        {/* Ces deux liens vivent dans le Shell : ils sont donc présents AUSSI
            sur l'écran de connexion vendeur et en mode démo — c'est-à-dire aux
            deux endroits où un vendeur arrive avant d'avoir un compte. Placés
            plus bas, dans la branche authentifiée, ils manquaient exactement
            là où on cherche à s'orienter. */}
        <p className="mt-2 text-xs">
          <Link
            href={POLICY_PATH}
            className="inline-flex min-h-11 items-center text-mist underline hover:text-cloud"
          >
            {t(lang, "policy.link")}
          </Link>
        </p>
        <div className="mt-5 rounded-2xl border border-line bg-surface/40 p-5">
          <p className="text-sm text-cloud">{t(lang, "sell.physical.q")}</p>
          <Link
            href="/vendre/physique"
            className="mt-3 inline-flex min-h-11 items-center rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-on-brand"
          >
            {t(lang, "sell.physical.cta")}
          </Link>
        </div>
        {/* LE TAUX DE COMMISSION — dans la Shell, donc sur les TROIS écrans :
            démo, non connecté, connecté. C'est le point : la commission est ce
            qui décide de s'inscrire, elle doit donc être lisible AVANT
            l'inscription. Placée dans la branche authentifiée, elle serait
            arrivée après la décision. */}
        <CommissionAnnonce
          taux={taux}
          labels={{
            title: t(lang, "sell.fee.title"),
            ligne: t(lang, "sell.fee.line"),
            exemple: t(lang, "sell.fee.example"),
            gratuit: t(lang, "sell.fee.free"),
          }}
        />

        <div className="mt-8">{children}</div>

        {/* COMMENT VENDRE — les trois pas vendeur que l'accueil portait
            jusqu'au 2026-09-04 (accueil premium §4.6). L'accueil garde un lien
            (`/vendre#comment`) ; les pas acheteur sont sur /aide#comment. */}
        <h2 id="comment" className="mt-12 scroll-mt-24 text-2xl font-bold tracking-tight">
          {t(lang, "home.how.sell")}
        </h2>
        <ol className="mt-4 grid gap-3">
          {(
            [
              ["home.s1.t", "home.s1.b"],
              ["home.s2.t", "home.s2.b"],
              ["home.s3.t", "home.s3.b"],
            ] as const
          ).map(([tt, bb]) => (
            <li key={tt} className="rounded-2xl border border-line bg-surface/40 p-5">
              <h3 className="text-base font-semibold">{t(lang, tt)}</h3>
              <p className="mt-1 text-sm text-mist">{t(lang, bb)}</p>
            </li>
          ))}
        </ol>
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
    /* Une base absente n'est PAS un « mode démo » : en production c'est un
     * incident, et il ne partait jusqu'ici aucun signal — la page rendait 200
     * et l'écran paraissait normal. Le journal le dit maintenant, une fois par
     * démarrage. L'utilisateur, lui, lit ce que ça veut dire POUR LUI ; le
     * chemin du fichier de configuration ne l'aiderait pas, il n'y a pas accès. */
    signalerConfigAbsente("supabase", { ecran: "/vendre" });
    return (
      <Shell lang={lang} taux={{ ...RATE_BPS }} subtitle={t(lang, "sell.demo.subtitle")}>
        <div className="glass rounded-2xl p-6 text-sm text-mist">
          {t(lang, "sell.demo.body")}
        </div>
        {/* L'indice technique n'existe qu'en dehors de la production. Un build
            servi — même en local — ne le rend pas : dès qu'on sert un build, on
            sert ce qu'un visiteur verrait. */}
        {horsProduction() && (
          <p className="mt-3 text-xs text-mist">
            Développement : configurez Supabase —{" "}
            <code className="text-cloud">supabase/README.md</code>
          </p>
        )}
      </Shell>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  /* Le taux RÉELLEMENT configuré (0054/0066), lu AVANT la branche « non
   * connecté » : c'est justement le visiteur sans compte qui vient chercher la
   * commission, et la lui montrer après l'inscription serait la lui montrer
   * après la décision. Une seule lecture sert les deux écrans. Repli =
   * constante compilée, identique au `coalesce` de la SQL. */
  const { taux } = await lireTauxCommission(supabase, (c) =>
    console.error("[commission] taux de repli utilisé", c),
  );

  if (!user) {
    return (
      <Shell lang={lang} taux={taux} subtitle={t(lang, "sell.login.subtitle")}>
        <Link
          href="/connexion?next=/vendre"
          className="inline-block rounded-xl bg-brand px-6 py-3 text-sm font-semibold text-on-brand"
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
  // 0098 : le second niveau, même source. Le formulaire filtre par département.
  const sousRayonsPublication = await lireSousRayonsPublication(supabase, lang);
  // Le tarif du surplus IA, affiché D'EMBLÉE sous le bouton d'aide — lu en
  // base (quota et prix suivent un UPDATE sans redéploiement), absent tant
  // que l'aide est éteinte ou 0071 non appliquée.
  const aiTarif = aiProviderDisponible()
    ? await tarifSurplusAffiche(createAdminClient(), lang)
    : undefined;

  const { data: mineRaw, error: mineError } = await supabase
    .from("products")
    .select("id, slug, title, status, kind, price_htg, description, cover_url, delivery_days, service_includes, product_assets(id,file_name,size_bytes)")
    .eq("seller_id", user.id)
    .order("created_at", { ascending: false });

  type MineRow = Omit<ReadinessProduct, "product_assets"> & {
    id: string;
    slug: string;
    title: string;
    status: string;
    kind: ProductKind;
    price_htg: number;
    product_assets: { id: string; file_name: string; size_bytes: number }[];
  };
  const mine = (mineRaw ?? []) as unknown as MineRow[];
  const { data: studioRows, error: studioError } = mine.length ? await supabase.from("zabelie_digital_studio").select("*").in("product_id", mine.map(p => p.id)) : { data: [], error: null };
  const studios = new Map((studioRows ?? []).map(row => [row.product_id, row as DigitalStudio]));
  const studioText = studioLabels(lang);
  const digitalDetails = await getDigitalDetails(mine.filter((p) => isDownloadable(p.kind)).map((p) => p.id));

  // Galerie V-1A (docs/35) : l'état initial de chaque gestionnaire vient du
  // serveur — [] tant que 0073 n'est pas appliquée, et le gestionnaire
  // affiche alors l'erreur de la route au premier essai (503 explicite).
  const galeries = await Promise.all(
    mine.map((p) => listerMedias(supabase, p.id))
  );
  // Rabais V-4 : map vide tant que 0075 n'est pas appliquée.
  const compares = await lireCompares(supabase, user.id);
  const offresFlash = await lireOffresVivantes(supabase, user.id);
  const flashLabels = {
    title: t(lang, "sell.flash.title"),
    pricePh: t(lang, "sell.flash.pricePh"),
    hoursPh: t(lang, "sell.flash.hoursPh"),
    unitsPh: t(lang, "sell.flash.unitsPh"),
    launch: t(lang, "sell.flash.launch"),
    stop: t(lang, "sell.flash.stop"),
    active: t(lang, "sell.flash.active"),
    hint: t(lang, "sell.flash.hint"),
    error: t(lang, "sell.flash.error"),
  };
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
    <Shell lang={lang} taux={taux} subtitle={t(lang, "sell.subtitle")}>

      <nav aria-label={t(lang, "seller.workspace")} className="mb-6 flex flex-wrap gap-2">
        {[["#mes-produits", "sell.mine.title"], ["/mes-ventes", "seller.orders"], ["/tableau-de-bord", "nav.dashboard"], ["/messages", "seller.messages"]].map(([href, key]) => (
          <Link key={href} href={href} className="inline-flex min-h-11 items-center rounded-full border border-line px-4 text-sm">{t(lang, key as import("@/lib/i18n").I18nKey)}</Link>
        ))}
      </nav>
      <details open={mine.length === 0} className="glass rounded-2xl p-6">
        <summary className="cursor-pointer text-lg font-semibold leading-11">{t(lang, "seller.new")}</summary>
        <div className="mt-4 max-w-xl">
        <PublishForm
          tier={tier}
          rateBpsEnVigueur={taux[tier]}
          aiActif={aiProviderDisponible() !== null}
          categories={rayonsPublication}
          sousRayons={sousRayonsPublication}
          labels={{
            titlePh: t(lang, "publish.title.ph"),
            kindAria: t(lang, "publish.kind.aria"),
            kindFile: t(lang, "product.kind.file"),
            kindService: t(lang, "product.kind.service"),
            categoryAria: t(lang, "publish.category.aria"),
            categoryEmpty: t(lang, "publish.category.empty"),
            subcategoryAria: t(lang, "publish.subcategory.aria"),
            subcategoryEmpty: t(lang, "publish.subcategory.empty"),
            pricePh: t(lang, "publish.price.ph"),
            descriptionPh: t(lang, "publish.description.ph"),
            digitalHint: t(lang, "seller.digital.guide"),
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
      </details>

      <div id="mes-produits" className="scroll-mt-24">
      {mineError && <p role="alert" className="mt-6 text-sm text-danger-text">{t(lang, "seller.load.error")}</p>}
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
                id={`produit-${p.id}`}
                className="scroll-mt-24 flex flex-col items-stretch gap-4 rounded-2xl border border-line bg-surface/60 p-5 text-sm"
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
                  <div className="my-4 rounded-xl border border-line p-4">
                    <h3 className="font-semibold">{t(lang, "seller.ready.title")}</h3>
                    <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                      {sellerReadiness({ ...p, digitalDetails: digitalDetails?.get(p.id) }, (galeries[i] ?? []).some((m) => m.kind === "image")).map((check) => (
                        <li key={check.key} className="flex items-start gap-2 text-xs">
                          <span aria-hidden="true" className={check.complete ? "text-success-text" : "text-warning-text"}>{check.complete ? "✓" : "○"}</span>
                          <span>{t(lang, check.key)} · {t(lang, check.complete ? "seller.ready.present" : "seller.ready.missing")}</span>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-3 text-xs text-mist">{t(lang, "seller.ready.note")}</p>
                    {isDownloadable(p.kind) && <p className="mt-2 text-xs text-mist">{t(lang, "seller.digital.guide")}</p>}
                  </div>
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
                  {p.status === "published" && <>
                  <RabaisManager
                    productId={p.id}
                    prixHtg={p.price_htg}
                    compareHtg={compares.get(p.id) ?? null}
                    labels={rabaisLabels}
                  />
                  <FlashManager
                    productId={p.id}
                    prixHtg={p.price_htg}
                    offre={offresFlash.get(p.id) ?? null}
                    labels={flashLabels}
                  />
                  </>}
                </div>
                {/* L'upload de livrable n'a de sens que pour un fichier. Le
                    `else` étiquetait « Service » tout le reste — un produit
                    physique s'affichait donc comme un service dans le
                    tableau de bord de son propre vendeur. */}
                {isDownloadable(p.kind, p.id) && p.status === "draft" && digitalDetails !== null && <DigitalDetailsEditor productId={p.id} initial={digitalDetails?.get(p.id)} labels={{
                  title: t(lang, "digital.edit.title"), hint: t(lang, "digital.edit.hint"),
                  formats: t(lang, "digital.formats"), language: t(lang, "digital.language"), compatibility: t(lang, "digital.compatibility"),
                  license: t(lang, "digital.license"), contents: t(lang, "digital.contents"), updates: t(lang, "digital.updates"),
                  save: t(lang, "digital.save"), saving: t(lang, "digital.saving"), saved: t(lang, "digital.saved"), error: t(lang, "digital.save.error"),
                }} />}
                {isDownloadable(p.kind, p.id) && p.status === "draft" && digitalDetails === null && <p role="alert" className="text-sm text-danger-text">{t(lang, "digital.save.error")}</p>}
                {isDownloadable(p.kind, p.id) && p.status === "draft" && <>
                  {studioError ? <p role="alert" className="text-danger-text">{studioText.error}</p> : <DigitalStudioEditor productId={p.id} initial={studios.get(p.id)} assets={p.product_assets} labels={studioText}/>}
                  <section className="rounded-xl border border-line p-4"><h3 className="font-semibold">{studioText.files}</h3><p className="mt-2 text-sm text-mist">{studioText.fileLimit}</p><ul className="mt-3 space-y-2">{p.product_assets.map(a => <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-line py-2"><span className="break-all">{a.file_name}</span><DigitalDraftAction productId={p.id} assetId={a.id} labels={studioText}/></li>)}</ul></section>
                </>}
                {isDownloadable(p.kind, p.id) && p.status === "published" && <DigitalDraftAction productId={p.id} labels={studioText}/>}
                {isDownloadable(p.kind, p.id) && p.status === "draft" ? (
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
      </div>
    </Shell>
  );
}
