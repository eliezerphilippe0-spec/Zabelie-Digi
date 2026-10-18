import Link from "next/link";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { VendeurShell } from "@/components/vendeur-shell";
import { ZabelieCouponManager, type CouponItem } from "@/components/zabelie-coupon-manager";
import { createAdminClient } from "@/lib/supabase/admin";
import { vendeurOuRedirection } from "@/lib/vendeur-acces";
import { getLang } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";

export const dynamic = "force-dynamic";
export const metadata = { title: "Codes promo — Zabelie", robots: { index: false, follow: false } };

/**
 * /tableau-de-bord/codes-promo — la gestion des codes (V-13, docs/73). Un code
 * s'applique aux produits du vendeur : sans produit, la page dit quoi faire
 * d'abord au lieu d'offrir un formulaire sans objet (même condition que
 * l'ancien tableau, qui masquait la section).
 */
export default async function CodesPromoPage() {
  const user = await vendeurOuRedirection("/tableau-de-bord/codes-promo");
  const lang = await getLang();
  const admin = createAdminClient();

  const [{ count: nbProduits }, { data: cps }] = await Promise.all([
    admin.from("products").select("id", { count: "exact", head: true }).eq("seller_id", user.id),
    admin
      .from("zabelie_coupons")
      .select("id, code, percent, product_id, max_uses, uses, expires_at, active")
      .eq("seller_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);
  const coupons = (cps ?? []) as CouponItem[];
  const [avantCode, apresCode] = t(lang, "vendeur.promo.texte").split("{code}");

  return (
    <div className="bg-grain min-h-dvh">
      <SiteNav />
      <main id="main">
        <VendeurShell lang={lang} actif="promo">
          <h1 className="text-2xl font-semibold sm:text-3xl">{t(lang, "vendeur.nav.promo")}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-mist">
            {avantCode}
            <span className="code-lisible font-bold text-accent">PROMO50</span>
            {apresCode}
          </p>
          {nbProduits ? (
            <div className="mt-6 rounded-2xl border border-line bg-surface/60 p-5">
              <ZabelieCouponManager coupons={coupons} />
            </div>
          ) : (
            <div className="mt-6 rounded-2xl border border-line p-5 text-sm">
              <p className="text-mist">{t(lang, "vendeur.promo.sansProduit")}</p>
              <Link href="/vendre" className="bouton mt-3 inline-flex min-h-11 items-center rounded-xl bg-brand px-4 text-sm font-semibold text-on-brand">
                {t(lang, "vendeur.produits.premier")}
              </Link>
            </div>
          )}
        </VendeurShell>
      </main>
      <SiteFooter />
    </div>
  );
}
