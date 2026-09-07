import Link from "next/link";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { PhysicalProductForm } from "@/components/physical-product-form";
import { getCurrentUser } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/products";
import { getLang } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";
import { ROUNDING_IN_FORCE } from "@/lib/commission";
import { lireTauxCommission } from "@/lib/commission-config";
import { createClient } from "@/lib/supabase/server";
import { aiProviderDisponible } from "@/lib/ai-description";
import { specsEtenduesDisponibles } from "@/lib/products-physical";
import { tarifSurplusAffiche } from "@/lib/ai-billing";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const metadata = { title: "Vendre un produit — Zabelie" };

/**
 * Chantier B — création d'un produit PHYSIQUE.
 * C'est aussi l'outil d'onboarding : les premières fiches vendeurs seront
 * saisies ici, à la main, par le porteur lui-même.
 */
export default async function VendrePhysiquePage() {
  const lang = await getLang();
  if (!isSupabaseConfigured()) {
    return (
      <div className="bg-grain min-h-dvh">
        <SiteNav />
        <main id="main" className="mx-auto max-w-xl px-5 py-16">
          <h1 className="text-3xl font-black tracking-tight">{t(lang, "sell.physical.title")}</h1>
          <p className="mt-4 text-sm text-mist">{t(lang, "sell.demo.body")}</p>
        </main>
        <SiteFooter />
      </div>
    );
  }

  const user = await getCurrentUser();
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
        <h1 className="text-3xl font-black tracking-tight">{t(lang, "sell.physical.title")}</h1>
        <p className="mt-2 text-sm text-cloud">
          {t(lang, "sell.physical.intro")}
        </p>
        <Link href="/vendre" className="mt-2 inline-flex min-h-11 items-center text-sm text-mist underline hover:text-cloud">
          {t(lang, "sell.physical.digital")}
        </Link>
        <section aria-labelledby="preparer" className="mt-6 rounded-2xl border border-line bg-surface/40 p-5">
          <h2 id="preparer" className="font-semibold">{t(lang, "sell.physical.prepare.title")}</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-mist">
            <li>{t(lang, "sell.physical.prepare.photo")}</li>
            <li>{t(lang, "sell.physical.prepare.details")}</li>
            <li>{t(lang, "sell.physical.prepare.stock")}</li>
          </ul>
        </section>

        {!user ? (
          <div className="mt-8 rounded-2xl border border-line bg-surface/60 p-6">
            <p className="text-sm text-cloud">
              {t(lang, "sell.login.subtitle")}
            </p>
            <Link
              href="/connexion?next=/vendre/physique"
              className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-brand px-5 py-2.5 text-sm font-bold text-on-brand"
            >
              {t(lang, "auth.signin.cta")}
            </Link>
          </div>
        ) : (
          <div className="mt-8">
            <PhysicalProductForm
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
                photoPrepareError: t(lang, "sell.physical.photo.prepareError"),
                manage: t(lang, "sell.physical.manage"),
                error: t(lang, "publish.error.generic"),
                network: t(lang, "error.network"),
              }}
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
