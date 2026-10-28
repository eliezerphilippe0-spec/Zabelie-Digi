import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { VendeurShell } from "@/components/vendeur-shell";
import {
  AffiliationManager,
  type AffiliationLabels,
  type ProduitAffiliable,
  type ProduitCommissionne,
} from "@/components/affiliation-manager";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { lienProduit, lignesCommissionnees, PRODUITS_COMMISSIONNES_MAX } from "@/lib/affiliation-catalogue";
import { formatHTG } from "@/lib/sample-data";
import { vendeurOuRedirection } from "@/lib/vendeur-acces";
import { estArchivee } from "@/lib/seller-products-filter";
import { siteUrl } from "@/lib/site-url";
import { getLang } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";

export const dynamic = "force-dynamic";
export const metadata = { title: "Affiliation — Zabelie", robots: { index: false, follow: false } };

/**
 * /tableau-de-bord/affiliation — la page affiliation du vendeur (option B,
 * docs/37 §A, migration 0081). Deux faces : devenir partageur (dormant tant que
 * le programme n'est pas armé) et offrir une commission sur ses produits
 * (permis dès maintenant, préparation). Rien ici n'arme le programme :
 * `config.actif` ne se change QUE par le porteur (son signal de lancement).
 *
 * Toutes les lectures sont tolérantes : le programme est DORMANT par défaut, et
 * une table encore absente retombe sur les bornes du PRD — jamais un écran cassé.
 */
export default async function AffiliationPage() {
  const user = await vendeurOuRedirection("/tableau-de-bord/affiliation");
  const lang = await getLang();
  const admin = createAdminClient();

  // Config (ligne unique) : l'état d'armement et les bornes, en points de base.
  // Table absente → dormant, bornes du PRD (docs/06 : 5–40 %).
  const { data: cfg } = await admin
    .from("zabelie_affiliate_config")
    .select("actif, taux_min_bps, taux_max_bps")
    .maybeSingle();
  const dormant = cfg?.actif !== true;
  const minBps = cfg?.taux_min_bps ?? 500;
  const maxBps = cfg?.taux_max_bps ?? 4000;

  // Mon code d'affilié, s'il existe (jamais mon nom). Absent/table manquante → null.
  const { data: aff } = await admin
    .from("zabelie_affiliates")
    .select("code")
    .eq("user_id", user.id)
    .maybeSingle();
  const code = (aff as { code?: string } | null)?.code ?? null;

  // Mes produits + le taux offert sur chacun. L'archivé ne reçoit pas d'offre :
  // il est retiré de la vente, une commission n'aurait aucun objet.
  const { data: prods } = await admin
    .from("products")
    .select("id, title, slug, status")
    .eq("seller_id", user.id)
    .order("created_at", { ascending: false });
  const vendables = (prods ?? []).filter(
    (p) => !estArchivee((p as { status: string }).status)
  ) as { id: string; title: string; slug: string; status: string }[];

  const taux = new Map<string, number>();
  if (vendables.length > 0) {
    const { data: rws } = await admin
      .from("zabelie_affiliate_rates")
      .select("product_id, rate_bps")
      .in("product_id", vendables.map((p) => p.id));
    for (const r of (rws ?? []) as { product_id: string; rate_bps: number }[]) {
      taux.set(r.product_id, r.rate_bps);
    }
  }

  const produits: ProduitAffiliable[] = vendables.map((p) => ({
    id: p.id,
    title: p.title,
    slug: p.slug,
    rateBps: taux.get(p.id) ?? null,
  }));

  const minPct = minBps / 100;
  const maxPct = maxBps / 100;

  /* PRODUITS QUI RAPPORTENT (audit UX-01). Lus sous la SESSION de l'affilié et
   * non en service-role : la visibilité publique des fiches (comptes d'essai
   * exclus, 0101) est portée par la RLS de `products`, et un affilié ne doit
   * pas se voir proposer ce qu'un acheteur ne peut pas ouvrir. Inutile tant que
   * le programme est fermé : on ne lit rien. `null` = lecture impossible, que
   * l'écran distingue de « aucun produit » (l'absence de signal est un signal). */
  let commissionnes: ProduitCommissionne[] | null = [];
  if (!dormant) {
    const supabase = await createClient();
    const { data: lues, error: errLues } = await supabase
      .from("zabelie_affiliate_rates")
      .select("rate_bps, product:products!inner(id, slug, title, price_htg, seller_id, status)")
      .eq("product.status", "published")
      .neq("product.seller_id", user.id)
      .gt("product.price_htg", 0)
      .order("rate_bps", { ascending: false })
      .limit(PRODUITS_COMMISSIONNES_MAX);
    commissionnes = errLues
      ? null
      : lignesCommissionnees(lues, user.id).map((l) => ({
          id: l.id,
          title: l.title,
          prix: formatHTG(l.priceHtg),
          rateBps: l.rateBps,
          lien: code ? lienProduit(siteUrl(), l.slug, code) : null,
        }));
  }

  // Libellés résolus ICI (serveur) et passés en props : un composant client
  // n'embarque jamais le dictionnaire. `lienIntro` et `vActuel` gardent leur
  // gabarit `{code}` / `{pct}`, substitué côté client sans `t`.
  const labels: AffiliationLabels = {
    titre: t(lang, "affil.titre"),
    intro: t(lang, "affil.intro"),
    bientot: t(lang, "affil.bientot"),
    devenir: t(lang, "affil.devenir"),
    code: t(lang, "affil.code"),
    lienTitre: t(lang, "affil.lien.titre"),
    lienIntro: t(lang, "affil.lien.intro"),
    erreur: t(lang, "affil.erreur"),
    copy: t(lang, "common.copy"),
    copied: t(lang, "common.copied"),
    vTitre: t(lang, "affil.vendeur.titre"),
    vIntro: t(lang, "affil.vendeur.intro"),
    vBornes: t(lang, "affil.vendeur.bornes", { min: String(minPct), max: String(maxPct) }),
    vPrepa: t(lang, "affil.vendeur.prepa"),
    vTaux: t(lang, "affil.vendeur.taux"),
    vOffrir: t(lang, "affil.vendeur.offrir"),
    vRetirer: t(lang, "affil.vendeur.retirer"),
    vActuel: t(lang, "affil.vendeur.actuel"),
    vAucun: t(lang, "affil.vendeur.aucun"),
    vSansProduit: t(lang, "affil.vendeur.sansProduit"),
    vProduitPremier: t(lang, "vendeur.produits.premier"),
    pTitre: t(lang, "affil.produits.titre"),
    pIntro: t(lang, "affil.produits.intro"),
    pVide: t(lang, "affil.produits.vide"),
    pTaux: t(lang, "affil.produits.taux"),
    pIndispo: t(lang, "vendeur.indisponible"),
  };

  return (
    <div className="bg-grain min-h-dvh">
      <SiteNav />
      <main id="main">
        <VendeurShell lang={lang} actif="affiliation">
          <h1 className="text-2xl font-semibold sm:text-3xl">{t(lang, "vendeur.nav.affiliation")}</h1>
          <AffiliationManager
            key={user.id}
            labels={labels}
            dormant={dormant}
            code={code}
            baseUrl={siteUrl()}
            minPct={minPct}
            maxPct={maxPct}
            produits={produits}
            commissionnes={commissionnes}
          />
        </VendeurShell>
      </main>
      <SiteFooter />
    </div>
  );
}
