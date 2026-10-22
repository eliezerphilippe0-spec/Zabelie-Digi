import { availableServiceStarters, serviceStarterCopy } from "@/lib/service-starters";
import { requireLegalAccountPage } from "@/lib/auth";
import { formatHTG } from "@/lib/sample-data";
import { ProductOffersEditor } from "@/components/product-offers-editor";
import { sellerOffers } from "@/lib/product-offers-server";
import { offerCopy } from "@/lib/product-offer-copy";
import { OFFER_KINDS, EMPTY_OFFERS, eligibleOffer, type OfferKind } from "@/lib/product-offers";
import { readSellerPricing, readSellerLaunch } from "@/lib/seller-pricing-server";
import { SellerLaunchPanel } from "@/components/seller-pricing-panel";
import type { SellerPricing } from "@/lib/seller-pricing";
import { ProductCommitmentEditor } from "@/components/product-commitment-editor";
import { getProductCommitments } from "@/lib/product-commitments-server";
import { marketplaceCopy } from "@/lib/marketplace-copy";
import { KIND_FILE, KIND_SERVICE as COMMITMENT_SERVICE, KIND_PHYSICAL as COMMITMENT_PHYSICAL } from "@/lib/product-kind";
import { FILTRES_PRODUITS, NOUVEAU_FICHIER, NOUVEAU_PRESTATION, compterParFiltre, dansLeFiltre, estArchivee, hrefCreer, hrefFiltre, hrefNouveau, lireFiltre, lireNouveau, type FiltreProduits } from "@/lib/seller-products-filter";
import { VendeurShell } from "@/components/vendeur-shell";
import type { I18nKey } from "@/lib/i18n";
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
import { metaPage } from "@/lib/meta-page";
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
import { COVER_MAX_OCTETS } from "@/lib/image-limits";
import { horsProduction, signalerConfigAbsente } from "@/lib/diagnostic";
import { aiProviderDisponible } from "@/lib/ai-description";
import { tarifSurplusAffiche } from "@/lib/ai-billing";
import { createAdminClient } from "@/lib/supabase/admin";
import { listerMedias, MAX_IMAGES_PER_PRODUCT } from "@/lib/product-media";
import { GalerieManager } from "@/components/galerie-manager";
import { PhotoPrincipale } from "@/components/photo-principale";
import { lireCompares, lireVariantesRabais } from "@/lib/product-discount";
import { RabaisManager } from "@/components/rabais-manager";
import { FlashManager } from "@/components/flash-manager";
import { lireOffresVivantes } from "@/lib/flash-vendeur";
import { creationActive, lireEnvCreation } from "@/lib/digital-authoring/flags";

export const dynamic = "force-dynamic";
// Titre, description, canonique, hreflang et partage dans la langue servie (lib/meta-page.ts).
export async function generateMetadata() {
  return metaPage("/vendre", await getLang(), "vendre");
}

function Shell({
  children,
  lang,
  subtitle,
  taux,
  marketing = false,
  pricing,
}: {
  marketing?: boolean;
  children: React.ReactNode;
  lang: Lang;
  subtitle?: string;
  /** Taux LU EN BASE (0054/0066) — jamais une constante de libellé. */
  taux: TauxCommission;
  pricing?: SellerPricing | null;
}) {
  if (marketing) return (
    <div className="bg-grain min-h-dvh editorial-page">
      <SiteNav />
      <main id="main" className="seller-landing mx-auto max-w-6xl px-5">
        <div className="seller-intro"><h1>{t(lang, "sell.landing.title")}</h1><p>{t(lang, "sell.landing.body")}</p></div>
        <div className="seller-layout">
          <section aria-labelledby="comment">
            <h2 id="comment" className="scroll-mt-32">{t(lang, "home.how.sell")}</h2>
            <ol className="seller-steps">{([
              ["home.s1.t", "home.s1.b"], ["home.s2.t", "home.s2.b"], ["home.s3.t", "home.s3.b"],
            ] as const).map(([title, body], index) => <li key={title}><span className="step-number" aria-hidden="true">0{index + 1}</span><div><h3>{t(lang, title)}</h3><p>{t(lang, body)}</p></div></li>)}</ol>
            <div className="seller-physical"><p>{t(lang, "sell.physical.q")}</p><Link href="/vendre/physique" className="editorial-link">{t(lang, "sell.physical.cta")}<span aria-hidden="true">→</span></Link></div>
            <Link href={POLICY_PATH} className="editorial-link seller-policy">{t(lang, "policy.link")}</Link>
          </section>
          <aside className="seller-decision">
            <CommissionAnnonce taux={taux} pricing={pricing} lang={lang} labels={{ title: t(lang, "sell.fee.title"), ligne: t(lang, "sell.fee.line"), exemple: t(lang, "sell.fee.example"), gratuit: t(lang, "sell.fee.free") }} />
            <div className="seller-entry">{children}</div>
          </aside>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
  /* VENDEUR CONNECTÉ : la rubrique « Produits » du tableau vendeur (docs/73),
     dans le même cadre et le même menu que l'accueil du tableau. Le choix du
     type (physique, fichier, service) et le filtre de la liste vivent dans la
     page ; le lien « produit physique » n'a plus à flotter en tête. */
  return (
    <div className="bg-grain min-h-dvh">
      <SiteNav />
      <main id="main">
        <VendeurShell lang={lang} actif="produits">
          <h1 className="text-2xl font-semibold tracking-tight lg:text-3xl">{t(lang, "vendeur.nav.produits")}</h1>
          {subtitle && <p className="mt-2 text-sm text-mist">{subtitle}</p>}
          <p className="mt-2 text-xs">
            <Link
              href={POLICY_PATH}
              className="inline-flex min-h-11 items-center text-mist underline hover:text-cloud"
            >
              {t(lang, "policy.link")}
            </Link>
          </p>
          {/* LE TAUX DE COMMISSION — dans la Shell, donc sur les TROIS écrans :
              démo, non connecté, connecté. C'est le point : la commission est ce
              qui décide de s'inscrire, elle doit donc être lisible AVANT
              l'inscription. Placée dans la branche authentifiée, elle serait
              arrivée après la décision. */}
          <CommissionAnnonce
            taux={taux}
            pricing={pricing}
            lang={lang}
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
          <h2 id="comment" className="mt-12 scroll-mt-32 text-2xl font-bold tracking-tight">
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
        </VendeurShell>
      </main>
      <SiteFooter />
    </div>
  );
}

export default async function VendrePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const lang = await getLang();
  // Rubrique « Produits » (2026-10-18) : l'onglet de la liste et le formulaire à ouvrir.
  const parametres = (await searchParams) ?? {};
  const filtre = lireFiltre(parametres.type);
  const nouveau = lireNouveau(parametres.nouveau);
  const starterCopy = serviceStarterCopy(lang);
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
      <Shell lang={lang} taux={{ ...RATE_BPS }} subtitle={t(lang, "sell.demo.subtitle")} marketing>
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

  const pricing = await readSellerPricing(supabase);
  const launch = user && pricing ? await readSellerLaunch(supabase, user.id, pricing, user.created_at) : null;

  if (!user) {
    return (
      <Shell lang={lang} taux={taux} subtitle={t(lang, "sell.login.subtitle")} pricing={pricing} marketing>
        <Link href="/connexion?mode=signup&next=/vendre" className="editorial-button">{t(lang, "auth.signup.cta")}<span aria-hidden="true">→</span></Link>
        <Link href="/connexion?next=/vendre" className="editorial-link">{t(lang, "sell.existing")}<span aria-hidden="true">→</span></Link>
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
    .select("id, slug, title, status, kind, price_htg, description, cover_url, delivery_days, service_includes, zabelie_auto_recommendations, product_assets(id,file_name,size_bytes)")
    .eq("seller_id", user.id)
    .order("created_at", { ascending: false });

  type MineRow = Omit<ReadinessProduct, "product_assets"> & {
    zabelie_auto_recommendations: boolean;
    id: string;
    slug: string;
    title: string;
    status: string;
    kind: ProductKind;
    price_htg: number;
    product_assets: { id: string; file_name: string; size_bytes: number }[];
  };
  const mine = (mineRaw ?? []) as unknown as MineRow[];
  await requireLegalAccountPage(user.id, "/vendre");
  const related = mine.length ? await sellerOffers(supabase, user.id) : null;
  const offerText = offerCopy(lang);
  const commitments = await getProductCommitments(mine.filter(p => p.kind === COMMITMENT_SERVICE || p.kind === COMMITMENT_PHYSICAL).map(p => p.id));
  const trustLabels = marketplaceCopy(lang);
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
  const variantsRabais = await lireVariantesRabais(supabase, mine.filter(p => p.kind === COMMITMENT_PHYSICAL).map(p => p.id));
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
    flashActive: t(lang, "sell.rabais.flashActive"),
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
    preparing: t(lang, "sell.galerie.preparing"),
    // La borne affichée EST celle du serveur (`lib/image-limits.ts`).
    tooHeavy: t(lang, "sell.galerie.heavy", {
      max: String(Math.round(COVER_MAX_OCTETS / 1024)),
    }),
    videoAdd: t(lang, "sell.galerie.video.add"),
    videoTooLong: t(lang, "sell.galerie.video.long"),
    videoTooBig: t(lang, "sell.galerie.video.big"),
  };
  // UX-02 : la photo que montrent le catalogue et l'accueil. Les états
  // « préparation », « envoi », « trop lourde », « échec » sont ceux de la
  // galerie : même compresseur, même plafond, mêmes mots pour le vendeur.
  const photoLabels = {
    title: t(lang, "sell.cover.title"),
    hint: t(lang, "sell.cover.hint"),
    add: t(lang, "sell.cover.add"),
    replace: t(lang, "sell.cover.replace"),
    preparing: galerieLabels.preparing,
    sending: galerieLabels.sending,
    saved: t(lang, "sell.cover.saved"),
    tooHeavy: galerieLabels.tooHeavy,
    error: galerieLabels.error,
  };
  // BL-130 (FRONT-14) : `status` est un mot-clé technique brut ("published")
  // — jamais affiché tel quel, toujours mappé sur un libellé FR/KR.
  //
  // « Brouillon » était exact et inutile : depuis que les trois types naissent
  // en brouillon et attendent une revue humaine, le vendeur qui ne voit rien
  // conclut que sa soumission a échoué — et resoumet. On récolterait des
  // doublons avant la première vente. Le libellé dit donc ce qui se passe.
  //
  // Une fiche ARCHIVÉE a été retirée par la modération : « en revue » lui
  // promettait une décision qui avait déjà été prise (audit 2026-10-19, UX-01).
  const statusLabel = (s: string) =>
    s === "published" ? t(lang, "status.published") : estArchivee(s) ? t(lang, "status.archived") : t(lang, "status.review");
  const uploadLabels = {
    sending: t(lang, "upload.sending"),
    replace: t(lang, "upload.replace"),
    add: t(lang, "upload.add"),
    saved: t(lang, "upload.saved"),
    error: t(lang, "upload.error"),
    errorNetwork: t(lang, "error.network"),
  };

  const comptes = compterParFiltre(mine);
  const LIBELLES_FILTRE: Record<FiltreProduits, I18nKey> = {
    tous: "sell.filter.all",
    physiques: "sell.filter.physical",
    services: "sell.filter.service",
    numeriques: "sell.filter.file",
    archivees: "sell.filter.archived",
  };
  // « Archivés » n'apparaît que s'il y a des fiches retirées (ou si l'URL le demande).
  const onglets = FILTRES_PRODUITS.filter((f) => f !== "archivees" || comptes.archivees > 0 || filtre === "archivees");
  const creer = hrefCreer(filtre);

  return (
    <Shell lang={lang} taux={taux} subtitle={t(lang, "sell.subtitle")} pricing={pricing}>
      <SellerLaunchPanel launch={launch} lang={lang} now={launch?.observed_at ?? 0} />

      {/* NOUVEAU PRODUIT — le type d'abord (2026-10-18). Le physique a sa page ;
          le fichier et le service ouvrent ici le formulaire, type déjà choisi.
          Le menu du tableau vendeur remplace l'ancienne rangée de liens.
          `scroll-mt-32` ici et sur #mes-produits : replié, l'en-tête fait
          108 px à 360 px ; 96 px laissaient le titre dessous. */}
      <section id="nouveau" aria-labelledby="nouveau-titre" className="glass scroll-mt-32 rounded-2xl p-6">
        <h2 id="nouveau-titre" className="text-lg font-semibold">{t(lang, "sell.new.title")}</h2>
        <p className="mt-1 text-sm text-mist">{t(lang, "sell.new.hint")}</p>
        {/* Navigation document : Next 16.4 met l'ancre initiale en cache puis la
            duplique au retour vers un type. Le brouillon survit en session. */}
        <ul className="mt-4 grid gap-3 sm:grid-cols-3">
          {([
            ["/vendre/physique", "sell.new.physical", "sell.new.physical.hint", null],
            [hrefNouveau(NOUVEAU_FICHIER), "sell.new.file", "sell.new.file.hint", KIND_FILE],
            [hrefNouveau(NOUVEAU_PRESTATION), "sell.new.service", "sell.new.service.hint", COMMITMENT_SERVICE],
          ] as const).map(([href, titre, aide, type]) => (
            <li key={href}>
              <a
                href={href}
                aria-current={type !== null && nouveau === type ? "true" : undefined}
                className="flex h-full min-h-11 flex-col rounded-xl border border-line p-4 hover:border-cloud aria-[current=true]:border-brand"
              >
                <span className="text-sm font-semibold">{t(lang, titre)}</span>
                <span className="mt-1 text-xs text-mist">{t(lang, aide)}</span>
              </a>
            </li>
          ))}
        </ul>
        {/* Studio de création éditoriale (docs/70) : seulement quand il est allumé. */}
        {creationActive(lireEnvCreation()) && (
          <Link href="/tableau-de-bord/creation" className="mt-3 inline-flex min-h-11 items-center text-sm underline">{t(lang, "sell.new.studio")}</Link>
        )}
        {/* Les cartes mènent ICI (#formulaire, UX-03) : au téléphone, le choix
            occupe l'écran et le formulaire restait dessous. Le type s'y lit en
            titre ; il se change en revenant au choix (UX-06). */}
        {nouveau && (
        <div id="formulaire" className="mt-6 max-w-xl scroll-mt-32 border-t border-line pt-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4">
          <h3 className="text-base font-semibold">{t(lang, nouveau === COMMITMENT_SERVICE ? "sell.form.service" : "sell.form.file")}</h3>
          <a href="/vendre#nouveau" className="inline-flex min-h-11 items-center text-sm underline">{t(lang, "sell.form.change")}</a>
        </div>
        <PublishForm
          key={`${user.id}:${nouveau}`}
          actorId={user.id}
          kind={nouveau}
          tier={tier}
          rateBpsEnVigueur={taux[tier]}
          pricing={pricing}
          lang={lang}
          aiActif={aiProviderDisponible() !== null}
          categories={rayonsPublication}
          sousRayons={sousRayonsPublication}
          serviceStarters={availableServiceStarters(lang, rayonsPublication, sousRayonsPublication)}
          starterLabels={{ heading: starterCopy.heading, hint: starterCopy.hint, confirmReplace: starterCopy.confirmReplace }}
          labels={{
            titlePh: t(lang, "publish.title.ph"),
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
        )}
      </section>

      <div id="mes-produits" className="scroll-mt-32">
      {mineError && <p role="alert" className="mt-6 text-sm text-danger-text">{t(lang, "seller.load.error")}</p>}
      {mine.length > 0 && (
        <div className="mt-10">
          <h2 className="text-sm font-semibold text-cloud">{t(lang, "sell.mine.title")}</h2>
          {mine.some((p) => p.status !== "published" && !estArchivee(p.status)) && (
            <p className="mt-2 text-xs text-mist">{t(lang, "status.review.hint")}</p>
          )}
          {/* Un onglet par type (2026-10-18) : la liste mêlait physique, fichiers
              et services. Les données restent lues pour TOUTES les fiches (les
              offres associées se choisissent entre types) ; seul l'affichage filtre. */}
          <nav aria-label={t(lang, "sell.filter.aria")} className="mt-3">
            <ul className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
              {onglets.map((f) => (
                <li key={f} className="shrink-0">
                  <Link
                    href={hrefFiltre(f)}
                    aria-current={f === filtre ? "page" : undefined}
                    className="flex min-h-11 items-center whitespace-nowrap rounded-full border border-line px-4 text-sm text-mist aria-[current=page]:border-cloud aria-[current=page]:bg-cloud aria-[current=page]:font-semibold aria-[current=page]:text-ink"
                  >
                    {t(lang, LIBELLES_FILTRE[f])} ({comptes[f]})
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          {/* Un onglet vide mène au formulaire de son type (UX-07). */}
          {comptes[filtre] === 0 && (
            <p role="status" className="mt-4 text-sm text-mist">
              {t(lang, "sell.filter.empty")}{" "}
              {creer && <Link href={creer} className="inline-flex min-h-11 items-center font-semibold text-cloud underline">{t(lang, "sell.filter.empty.cta")}</Link>}
            </p>
          )}
          <ul className="mt-3 space-y-2">
            {mine.map((p, i) => dansLeFiltre(p, filtre) && (
              <li
                key={p.slug}
                id={`produit-${p.id}`}
                className="scroll-mt-32 flex flex-col items-stretch gap-4 rounded-2xl border border-line bg-surface/60 p-5 text-sm"
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
                      p.status === "published" || estArchivee(p.status)
                        ? "text-xs text-mist"
                        : "text-xs font-semibold text-warning-text"
                    }
                  >
                    {statusLabel(p.status)}
                  </span>
                  {estArchivee(p.status) && (
                    <p className="mt-1 text-xs text-mist">
                      {t(lang, "sell.archived.hint")}{" "}
                      <Link href="/aide" className="inline-flex min-h-11 items-center underline hover:text-cloud">{t(lang, "nav.help")}</Link>
                    </p>
                  )}
                  <div className="my-4 rounded-xl border border-line p-4">
                    <h3 className="font-semibold">{t(lang, "seller.ready.title")}</h3>
                    <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                      {sellerReadiness({ ...p, digitalDetails: digitalDetails?.get(p.id) }).map((check) => (
                        <li key={check.key} className="flex items-start gap-2 text-xs">
                          <span aria-hidden="true" className={check.complete ? "text-success-text" : "text-warning-text"}>{check.complete ? "✓" : "○"}</span>
                          <span>{t(lang, check.key)} · {t(lang, check.complete ? "seller.ready.present" : "seller.ready.missing")}</span>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-3 text-xs text-mist">{t(lang, "seller.ready.note")}</p>
                    {isDownloadable(p.kind) && <p className="mt-2 text-xs text-mist">{t(lang, "seller.digital.guide")}</p>}
                  </div>
                  {(p.kind === COMMITMENT_SERVICE || p.kind === COMMITMENT_PHYSICAL) && (commitments === null ? <p role="status" className="mt-4 text-sm text-mist">{trustLabels.missing}</p> : <ProductCommitmentEditor productId={p.id} initial={commitments.get(p.id)} labels={trustLabels} service={p.kind === COMMITMENT_SERVICE}/>)}
                  {/* UX-02 : sur un BROUILLON seulement — la règle de l'atelier
                      numérique (on ne modifie qu'en brouillon) vaut pour la
                      photo que le public verra (SEC-01). */}
                  {p.status === "draft" && (
                    <PhotoPrincipale productId={p.id} initialUrl={p.cover_url} labels={photoLabels} />
                  )}
                  {p.status === "published" && (
                    <p className="mt-3 text-xs text-mist">{t(lang, "sell.galerie.reviewHint")}</p>
                  )}
                  <GalerieManager
                    productId={p.id}
                    readOnly={estArchivee(p.status)}
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
                  {(variantsRabais.get(p.id)?.length ?? 0) > 1 ? <div className="mt-4 space-y-3">
                    <h4 className="text-sm font-semibold">{t(lang, "sell.rabais.variants")}</h4>
                    {variantsRabais.get(p.id)!.map(v => <div key={v.id}>
                      <p className="text-sm">{v.options?.variante || Object.values(v.options ?? {}).join(" · ") || t(lang, "sell.rabais.standard")}</p>
                      <RabaisManager key={v.id + ":" + v.price_htg + ":" + v.compare_at_htg} productId={p.id} variantId={v.id}
                        prixHtg={v.price_htg} compareHtg={v.compare_at_htg ?? null} labels={rabaisLabels}/>
                    </div>)}
                  </div> : <RabaisManager
                    key={p.id + ":" + p.price_htg + ":" + compares.get(p.id)}
                    productId={p.id}
                    prixHtg={p.price_htg}
                    compareHtg={compares.get(p.id) ?? null}
                    labels={rabaisLabels}
                  />}
                  {related ? (() => {
                    const rows = related.offers.filter(o => o.source_product_id === p.id);
                    const initial = { ...EMPTY_OFFERS };
                    const confirmed = { upsell: 0, cross_sell: 0, downsell: 0 };
                    for (const row of rows) { initial[row.offer_kind] = row.target_product_id; confirmed[row.offer_kind] = related.stats.get(row.id) ?? 0; }
                    const choices = Object.fromEntries(OFFER_KINDS.map(kind => [kind, mine.filter(target => eligibleOffer(p, target, kind)).map(target => ({ id: target.id, label: target.title + " · " + formatHTG(target.price_htg) }))])) as Record<OfferKind, { id: string; label: string }[]>;
                    return <ProductOffersEditor key={p.id} productId={p.id} initial={initial} choices={choices} confirmed={confirmed} automatic={p.zabelie_auto_recommendations} automaticSales={related.recommendations?.get(p.id) ?? (related.recommendations ? 0 : null)} copy={offerText}/>;
                  })() : <p className="mt-4 text-sm text-mist">{offerText.unavailable}</p>}
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
