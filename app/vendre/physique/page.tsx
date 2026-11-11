import { readSellerPricing, readSellerLaunch } from "@/lib/seller-pricing-server";
import { SellerPricingPanel, SellerLaunchPanel } from "@/components/seller-pricing-panel";
import Link from "next/link";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { PhysicalProductForm } from "@/components/physical-product-form";
import { getCurrentUser, requireLegalAccountPage } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/products";
import { getLang } from "@/lib/i18n-server";
import { metaPage } from "@/lib/meta-page";
import { t } from "@/lib/i18n";
import { ROUNDING_IN_FORCE } from "@/lib/commission";
import { lireTauxCommission } from "@/lib/commission-config";
import { createClient } from "@/lib/supabase/server";
import { aiProviderDisponible } from "@/lib/ai-description";
import { specsEtenduesDisponibles } from "@/lib/products-physical";
import { tarifSurplusAffiche } from "@/lib/ai-billing";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { MessageErreur } from "@/components/message-erreur";
import { formatHTG } from "@/lib/sample-data";
import { KIND_PHYSICAL } from "@/lib/product-kind";
import { PARAM_PREPAREE, cheminFichePreparee, lireIdPreparee } from "@/lib/fiche-preparee";
import { lireFichePreparee } from "@/lib/fiche-preparee-serveur";

export const dynamic = "force-dynamic";
// Titre, description, canonique, hreflang et partage dans la langue servie (lib/meta-page.ts).
export async function generateMetadata() {
  return metaPage("/vendre/physique", await getLang(), "vendrePhysique");
}

/**
 * Chantier B — création d'un produit PHYSIQUE.
 * C'est aussi l'outil d'onboarding : les premières fiches vendeurs seront
 * saisies ici, à la main, par le porteur lui-même.
 */
export default async function VendrePhysiquePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const lang = await getLang();
  const idPreparee = lireIdPreparee(((await searchParams) ?? {})[PARAM_PREPAREE]);
  if (!isSupabaseConfigured()) {
    return (
      <div className="bg-grain min-h-dvh">
        <SiteNav />
        <main id="main" className="mx-auto max-w-xl px-5 py-16">
          <h1>{t(lang, "sell.physical.title")}</h1>
          <p className="mt-4 text-sm text-mist">{t(lang, "sell.demo.body")}</p>
        </main>
        <SiteFooter />
      </div>
    );
  }

  const user = await getCurrentUser();
  if (user) await requireLegalAccountPage(user.id, "/vendre/physique");
  const pricingClient = await createClient();
  const pricing = await readSellerPricing(pricingClient);
  const launch = user && pricing ? await readSellerLaunch(pricingClient, user.id, pricing, user.createdAt) : null;
  /* FICHE PRÉPARÉE PAR UN ASSISTANT (lot 3b, 0171) — lue avec le client de
   * SESSION (RLS : les siennes seulement). Une fiche d'un autre type est
   * renvoyée vers son formulaire. */
  const prepareeLue = user && idPreparee ? await lireFichePreparee(pricingClient, user.id, idPreparee) : null;
  if (prepareeLue && cheminFichePreparee(KIND_PHYSICAL, prepareeLue.fiche.id) !== prepareeLue.chemin) redirect(prepareeLue.chemin);
  const prepareeAbsente = Boolean(user) && idPreparee !== null && !prepareeLue;
  // Sans session, le lien de connexion ramène à CETTE fiche préparée.
  const retour = idPreparee ? (cheminFichePreparee(KIND_PHYSICAL, idPreparee) ?? "/vendre/physique") : "/vendre/physique";
  // Le taux RÉELLEMENT configuré (0054/0066) : l'estimation suit un UPDATE
  // d'exploitation sans redéploiement. Repli = constante compilée.
  const { taux } = await lireTauxCommission(await createClient(), (c) =>
    console.error("[commission] taux de repli utilisé", c),
  );
  // Marque/matière/état : montrés seulement si 0074 est appliquée (sonde).
  const specsEtendues = await specsEtenduesDisponibles(await createClient());
  const specsLabels = {
    title: t(lang, "sell.specs.title"),
    weight: t(lang, "sell.specs.weight"),
    dims: t(lang, "sell.specs.dims"),
    brand: t(lang, "sell.specs.brand"),
    material: t(lang, "sell.specs.material"),
    condition: t(lang, "sell.specs.condition"),
    conditionNef: t(lang, "specs.condition.nef"),
    conditionDezyem: t(lang, "specs.condition.dezyem"),
  };
  // Tarif du surplus IA, lu en base — voir app/vendre/page.tsx.
  const aiTarif = aiProviderDisponible()
    ? await tarifSurplusAffiche(createAdminClient(), lang)
    : undefined;
  const aiLabels = {
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
  };
  const netLabels = {
    youReceive: t(lang, "publish.net.youReceive"),
    fee: t(lang, "publish.net.fee"),
    rounding: t(
      lang,
      ROUNDING_IN_FORCE === "floor"
        ? "publish.net.rounding.floor"
        : "publish.net.rounding",
    ),
    caveat: t(lang, "publish.net.caveat"),
  };

  return (
    <div className="bg-grain min-h-dvh">
      <SiteNav />
      <main id="main" className="mx-auto max-w-xl px-5 py-16">
        <h1>{t(lang, "sell.physical.title")}</h1>
        <p className="mt-2 text-sm text-cloud">
          {t(lang, "sell.physical.intro")}
        </p>
        <Link href="/vendre" className="mt-2 inline-flex min-h-11 items-center text-sm text-mist underline hover:text-cloud">
          {t(lang, "sell.physical.digital")}
        </Link>
        <section aria-labelledby="preparer" className="mt-6 rounded-xl border border-line bg-surface/40 p-5">
          <h2 id="preparer" className="titre-bloc">{t(lang, "sell.physical.prepare.title")}</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-mist">
            <li>{t(lang, "sell.physical.prepare.photo")}</li>
            <li>{t(lang, "sell.physical.prepare.details")}</li>
            <li>{t(lang, "sell.physical.prepare.stock")}</li>
          </ul>
        </section>

        {pricing && <SellerPricingPanel pricing={pricing} lang={lang} />}
        <SellerLaunchPanel launch={launch} lang={lang} now={launch?.observed_at ?? 0} />
        {!user ? (
          <div className="mt-8 rounded-xl border border-line bg-surface/60 p-6">
            <p className="text-sm text-cloud">
              {t(lang, "sell.login.subtitle")}
            </p>
            <Link
              href={`/connexion?next=${encodeURIComponent(retour)}`}
              className="bouton bouton-primaire bouton-compact mt-4"
            >
              {t(lang, "auth.signin.cta")}
            </Link>
          </div>
        ) : (
          <div className="mt-8">
            {prepareeAbsente && <MessageErreur className="mb-4">{t(lang, "prepared.missing")}</MessageErreur>}
            <PhysicalProductForm
              key={user.id}
              actorId={user.id}
              preparee={prepareeLue ? {
                fiche: prepareeLue.fiche,
                prixAffiche: prepareeLue.fiche.prixHtg !== null ? formatHTG(prepareeLue.fiche.prixHtg) : null,
                labels: {
                title: t(lang, "prepared.title"), hint: t(lang, "prepared.hint"), hintNoKey: t(lang, "prepared.hintNoKey"),
                price: t(lang, "prepared.price"), cta: t(lang, "prepared.cta"), done: t(lang, "prepared.done"),
                already: t(lang, "prepared.already"),
              },
              } : undefined}
              importLabels={{
                title: t(lang, "import.title"), hint: t(lang, "import.hint"), rights: t(lang, "import.rights"),
                url: t(lang, "import.url"), cta: t(lang, "import.cta"), loading: t(lang, "import.loading"),
                done: t(lang, "import.done"), replace: t(lang, "import.replace"), errorNetwork: t(lang, "error.network"),
              }}
              listingLabels={{
                description: t(lang, "sell.physical.description"),
                descriptionHint: t(lang, "sell.physical.description.hint"),
                draft: t(lang, "sell.physical.draft"),
                creating: t(lang, "sell.physical.creating"),
                draftNote: t(lang, "sell.physical.draft.note"),
                saved: t(lang, "sell.physical.saved"),
                photoFailed: t(lang, "sell.physical.photo.failed"),
                photoRetry: t(lang, "sell.physical.photo.retry"),
                photoChoose: t(lang, "sell.physical.photo.choose"),
                photoPick: t(lang, "sell.physical.photo.pick"),
                photoPrepareError: t(lang, "sell.physical.photo.prepareError"),
                manage: t(lang, "sell.physical.manage"),
                error: t(lang, "publish.error.generic"),
                network: t(lang, "error.network"),
              }}
              pricing={pricing}
              lang={lang}
              tier={user.tier}
              rateBpsEnVigueur={taux[user.tier]}
              netLabels={netLabels}
              policyAccept={t(lang, "policy.accept")}
              policyRead={t(lang, "policy.accept.read")}
              aiActif={aiProviderDisponible() !== null}
              aiLabels={aiLabels}
              specsEtendues={specsEtendues}
              specsLabels={specsLabels}
            />
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
