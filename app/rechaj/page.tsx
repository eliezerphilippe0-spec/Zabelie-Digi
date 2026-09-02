import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import {
  ZabelieTopupForm,
  type TopupProductOption,
  type TopupRailOption,
} from "@/components/zabelie-topup-form";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/products";
import { isTopupEnabled } from "@/lib/zabelie-topup/fulfill";
import { isZelleEnabled } from "@/lib/zelle";
import { formatHTG } from "@/lib/sample-data";
import { redirect } from "next/navigation";
import { isTopupFirstPartyEnabled } from "@/lib/topup-flag";
import { getLang } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";

export const dynamic = "force-dynamic";
export const metadata = { title: "Recharge téléphone — Zabelie" };

/**
 * Recharge téléphonique Digicel/Natcom (V-11) — service first-party.
 * BRH : revendeur télécom, paiement → livraison immédiate, aucun solde stocké.
 */
export default async function RechajPage() {
  // Vente first-party close par decision du porteur (2026-08-01). Redirection
  // plutot que 404 : la page a ete annoncee, un lien externe peut exister, et
  // /catalogue est ce que le visiteur cherchait — des produits a acheter.
  // `/rechaj/[orderId]` reste OUVERT : une commande deja payee doit rester
  // consultable et remboursable. Voir lib/topup-flag.ts.
  if (!isTopupFirstPartyEnabled()) redirect("/catalogue");

  const lang = await getLang();

  const enabled = isSupabaseConfigured() && isTopupEnabled();
  let products: TopupProductOption[] = [];
  if (enabled) {
    const admin = createAdminClient();
    const { data } = await admin
      .from("zabelie_topup_products")
      .select("id, operator, face_value_htg, price_htg")
      .eq("active", true)
      .order("face_value_htg", { ascending: true });
    products = (data ?? []).map((p) => ({
      id: p.id,
      operator: p.operator as "digicel" | "natcom",
      faceValueHtg: p.face_value_htg,
      priceHtg: p.price_htg,
      priceLabel: formatHTG(p.price_htg),
    }));
  }

  const rate = Number(process.env.USD_HTG_RATE);
  const zelle = isZelleEnabled() && Number.isFinite(rate) && rate > 0;
  const rails: TopupRailOption[] = [
    { rail: "moncash", label: t(lang, "product.pay", { price: "{price}" }) },
    ...(zelle
      ? [{ rail: "zelle" as const, label: t(lang, "product.pay.zelle", { usd: "{price}" }) }]
      : []),
  ];

  return (
    <div className="bg-grain min-h-dvh">
      <SiteNav />
      <main id="main" className="mx-auto max-w-md px-5 py-14">
        <h1 className="text-3xl font-extrabold tracking-tight">
          {t(lang, "topup.title")}
        </h1>
        <p className="mt-3 text-sm text-mist">{t(lang, "topup.sub")}</p>

        <div className="mt-8">
          {!enabled || products.length === 0 ? (
            <p className="rounded-2xl border border-line bg-surface/60 p-6 text-sm text-mist">
              {t(lang, "topup.disabled")}
            </p>
          ) : (
            <ZabelieTopupForm
              products={products}
              rails={rails}
              htgPerUsd={zelle ? rate : undefined}
              labels={{
                operator: t(lang, "topup.operator"),
                phoneLabel: t(lang, "topup.phone.label"),
                phonePh: t(lang, "topup.phone.ph"),
                phone2Label: t(lang, "topup.phone2.label"),
                phone2Why: t(lang, "topup.phone2.why"),
                mismatch: t(lang, "topup.mismatch"),
                invalid: t(lang, "topup.invalid"),
                detected: t(lang, "topup.detected"),
                amountLabel: t(lang, "topup.amount.label"),
                receives: t(lang, "topup.receives"),
                loading: t(lang, "pay.redirect"),
                errorGeneric: t(lang, "error.generic"),
                errorNetwork: t(lang, "error.network"),
                errorProvider: t(lang, "error.provider"),
              }}
            />
          )}
        </div>

        <p className="mt-8 text-xs text-mist/80">{t(lang, "topup.legal")}</p>
      </main>
      <SiteFooter />
    </div>
  );
}
