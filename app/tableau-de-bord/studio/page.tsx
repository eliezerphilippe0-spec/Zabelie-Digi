import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { StudioGenerator, type StudioProduit } from "@/components/studio-generator";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { studioProvider } from "@/lib/studio-server";
import { CONFIG_TABLE } from "@/lib/creative/studio";
import { coverUrlAt } from "@/lib/product-image";
import { formatHTG } from "@/lib/sample-data";
import { getLang } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";

export const dynamic = "force-dynamic";
export const metadata = { title: "Studio — Zabelie" };

/**
 * /tableau-de-bord/studio — le Studio Créatif côté vendeur (docs/62, Phase 4).
 *
 * Studio éteint → 404 : la page n'existe pas plus que ses routes. Seuls les
 * produits du vendeur dont la photo est une URL https sont proposés — c'est
 * la même condition que la route, qui la revérifie de toute façon.
 */
export default async function StudioPage() {
  if (!studioProvider()) notFound();
  const user = await getCurrentUser();
  if (!user) redirect("/connexion");

  const lang = await getLang();
  const admin = createAdminClient();
  const [{ data: prods }, { data: cfg }] = await Promise.all([
    admin.from("products").select("id, title, price_htg, cover_url")
      .eq("seller_id", user.id).like("cover_url", "https://%")
      .order("created_at", { ascending: false }).limit(30),
    admin.from(CONFIG_TABLE).select("gratuit_jour, prix_image_htg").maybeSingle(),
  ]);

  const produits: StudioProduit[] = (prods ?? []).map((p) => ({
    id: p.id,
    title: p.title,
    thumb: coverUrlAt(p.cover_url, 320) ?? p.cover_url,
    prixAffiche: formatHTG(p.price_htg),
  }));
  // Le tarif s'affiche D'EMBLÉE, depuis la config en base : jamais un chiffre codé ici.
  const tarif = typeof cfg?.gratuit_jour === "number" && typeof cfg?.prix_image_htg === "number"
    ? t(lang, "estidyo.tarif").replace("{gratis}", String(cfg.gratuit_jour)).replace("{prix}", String(cfg.prix_image_htg))
    : null;

  return (
    <>
      <SiteNav />
      <main id="main" className="mx-auto max-w-3xl px-4 py-8">
        <Link href="/tableau-de-bord" className="text-sm text-mist underline">← {t(lang, "shop.manage")}</Link>
        <h1 className="mt-3 text-2xl font-semibold">{t(lang, "estidyo.titre")}</h1>
        <p className="mt-2 text-sm leading-relaxed text-mist">{t(lang, "estidyo.intro")}</p>
        {tarif && <p className="mt-2 text-xs text-mist">{tarif}</p>}
        <div className="mt-6">
          {produits.length === 0 ? (
            <p className="text-sm text-mist">{t(lang, "estidyo.aucun")}</p>
          ) : (
            <StudioGenerator produits={produits} labels={{
              produit: t(lang, "estidyo.produit"),
              format: t(lang, "estidyo.format"),
              cadrage: t(lang, "estidyo.cadrage"),
              formats: {
                "1:1": t(lang, "estidyo.format.carre"),
                "3:4": t(lang, "estidyo.format.portrait"),
                "9:16": t(lang, "estidyo.format.story"),
              },
              cadrages: {
                gros_plan: t(lang, "estidyo.cadrage.gros_plan"),
                en_situation: t(lang, "estidyo.cadrage.en_situation"),
                en_usage: t(lang, "estidyo.cadrage.en_usage"),
              },
              lancer: t(lang, "estidyo.lancer"),
              encours: t(lang, "estidyo.encours"),
              payant: t(lang, "estidyo.payant"),
              payer: t(lang, "estidyo.payer"),
              pret: t(lang, "estidyo.pret"),
              revue: t(lang, "estidyo.revue"),
              telecharger: t(lang, "estidyo.telecharger"),
              echec: t(lang, "estidyo.echec"),
              lent: t(lang, "estidyo.lent"),
              erreur: t(lang, "estidyo.erreur"),
            }} />
          )}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
