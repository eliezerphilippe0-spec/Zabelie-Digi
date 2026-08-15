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
  if (!isSupabaseConfigured()) {
    return (
      <div className="bg-grain min-h-screen">
        <SiteNav />
        <main className="mx-auto max-w-xl px-5 py-16">
          <h1 className="text-3xl font-black tracking-tight">Vendre un produit</h1>
          <p className="mt-4 text-sm text-mist">Mode démo — Supabase non configuré.</p>
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
  const lang = await getLang();
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
    <div className="bg-grain min-h-screen">
      <SiteNav />
      <main className="mx-auto max-w-xl px-5 py-16">
        <h1 className="text-3xl font-black tracking-tight">Vendre un produit</h1>
        <p className="mt-2 text-sm text-cloud">
          Photo, prix, quantité — votre produit est en ligne en moins d&apos;une
          minute. Vous vendez un fichier ou un service ?{" "}
          <Link href="/vendre" className="underline">
            C&apos;est par ici
          </Link>
          .
        </p>

        {!user ? (
          <div className="mt-8 rounded-2xl border border-line bg-surface/60 p-6">
            <p className="text-sm text-cloud">
              Connectez-vous pour publier un produit.
            </p>
            <Link
              href="/connexion?suivant=/vendre/physique"
              className="mt-4 inline-block rounded-xl bg-brand px-5 py-2.5 text-sm font-bold text-on-brand"
            >
              Se connecter
            </Link>
          </div>
        ) : (
          <div className="mt-8">
            <PhysicalProductForm
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
