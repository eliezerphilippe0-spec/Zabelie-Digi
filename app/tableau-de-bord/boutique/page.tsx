import Link from "next/link";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { VendeurShell } from "@/components/vendeur-shell";
import { ShareButtons } from "@/components/share-buttons";
import { ProfileForm } from "@/components/profile-form";
import { ServiceZonesEditor } from "@/components/service-zones-editor";
import { createAdminClient } from "@/lib/supabase/admin";
import { vendeurOuRedirection } from "@/lib/vendeur-acces";
import { getZonesActives, libelleZone } from "@/lib/zones";
import { siteUrl } from "@/lib/site-url";
import { hrefBoutique } from "@/lib/boutique-href";
import { qrBoutique } from "@/lib/boutique-qr";
import { createClient } from "@/lib/supabase/server";
import { commandesPour100Vues, jourHaiti, totalVues } from "@/lib/boutik-visites-calcul";
import { LIMITE_VENTES_LUES, STATUTS_VENTE_REELLE, estVenteReelle, type LigneVente } from "@/lib/vendeur-clients";
import { LOCALE_DATE } from "@/lib/facturation-copy";
import { getLang } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ma boutique — Zabelie", robots: { index: false, follow: false } };

/**
 * /tableau-de-bord/boutique — ce que voient les clients (docs/73) : l'adresse
 * de la boutique, son partage, la présentation publique. Ces blocs vivaient
 * en bas d'un tableau de quinze écrans, et le lien de la boutique y paraissait
 * deux fois. Les Studios et l'API sont passés dans le menu.
 */
export default async function BoutiquePage() {
  const user = await vendeurOuRedirection("/tableau-de-bord/boutique");
  const lang = await getLang();
  const admin = createAdminClient();

  let profile = {
    display_name: user.displayName,
    bio: "",
    avatar_url: "",
    country_code: "",
    region_code: "",
    zone_id: "",
    pwen_repe: "",
  };
  const { data: prof } = await admin
    .from("profiles")
    .select("display_name, bio, avatar_url, country_code, region_code, zone_id, pwen_repe")
    .eq("id", user.id)
    .maybeSingle();
  if (prof) {
    profile = {
      display_name: prof.display_name ?? user.displayName,
      bio: prof.bio ?? "",
      avatar_url: prof.avatar_url ?? "",
      country_code: prof.country_code ?? "",
      region_code: prof.region_code ?? "",
      zone_id: prof.zone_id ?? "",
      pwen_repe: prof.pwen_repe ?? "",
    };
  }
  /* L'adresse publique lisible (0083), lue À PART et sans bruit : la colonne
     n'existe qu'après application, et le code se déploie avant. Absente →
     `hrefBoutique` retombe sur /createur/<id>, qui ne cesse jamais de marcher. */
  const { data: slugRow } = await admin
    .from("profiles")
    .select("boutik_slug")
    .eq("id", user.id)
    .maybeSingle();
  const boutikSlug = (slugRow as { boutik_slug?: string | null } | null)?.boutik_slug ?? null;
  const qr = qrBoutique({ id: user.id, boutikSlug });

  /* PR-Z2 (docs/75 §5.A) : vues des 30 derniers jours. CLIENT DE SESSION — la
     RLS de 0155 ne montre que les lignes du vendeur. Table absente (0155 pas
     encore appliquée) ou lecture en échec → section masquée, rien d'inventé.
     Les commandes suivent la définition de « Mes clients » (vente réelle). */
  const maintenant = new Date();
  const depuis = jourHaiti(maintenant, -29);
  const { data: vis, error: visErr } = await (await createClient())
    .from("zabelie_boutik_visites")
    .select("jour, vues")
    .eq("seller_id", user.id)
    .gte("jour", depuis);
  let mesure: { vues: number; commandes: number; pour100: number | null } | null = null;
  if (!visErr) {
    const seuil = maintenant.getTime() - 30 * 86_400_000;
    const { data: ventes, error: ventesErr } = await admin
      .from("orders")
      .select("buyer_id, product_id, amount_htg, status, zabelie_payment_is_live, created_at, products!orders_product_id_fkey!inner(seller_id, title)")
      .eq("products.seller_id", user.id)
      .in("status", [...STATUTS_VENTE_REELLE])
      .eq("zabelie_payment_is_live", true)
      .gt("amount_htg", 0)
      .gte("created_at", new Date(seuil).toISOString())
      .limit(LIMITE_VENTES_LUES);
    if (!ventesErr) {
      const vues = totalVues((vis ?? []) as { jour: string; vues: number }[], depuis);
      const commandes = ((ventes ?? []) as unknown as LigneVente[])
        .filter((l) => estVenteReelle(l, user.id) && Date.parse(l.created_at) >= seuil).length;
      mesure = { vues, commandes, pour100: commandesPour100Vues(commandes, vues) };
    }
  }

  // PR-Z3 (docs/33 §4) : la déclaration de zone (« Ki kote ou ye ? ») vit
  // dans le formulaire de profil. Libellés précalculés côté serveur — un
  // composant client ne lit pas les cookies de langue.
  const zonesPourForm = (await getZonesActives()).map((z) => ({
    id: z.id,
    parent_id: z.parent_id,
    level: z.level,
    label: libelleZone(z, lang),
  }));
  const zoneLabels = {
    title: t(lang, "zone.form.title"),
    hint: t(lang, "zone.form.hint"),
    depatman: t(lang, "zone.level.depatman"),
    komin: t(lang, "zone.level.komin"),
    katye: t(lang, "zone.level.katye"),
    pwen: t(lang, "zone.form.pwen"),
    pwenPh: t(lang, "zone.form.pwen.ph"),
    all: t(lang, "zone.filter.all"),
    reqHint: t(lang, "zone.req.hint"),
    reqPh: t(lang, "zone.req.ph"),
    reqBtn: t(lang, "zone.req.btn"),
    reqOk: t(lang, "zone.req.ok"),
    reqDup: t(lang, "zone.req.dup"),
    reqErr: t(lang, "zone.req.err"),
  };

  /* Lot 2 (docs/77 §8, 0158) : les zones où le vendeur DÉCLARE livrer. CLIENT DE
     SESSION — lecture publique, mais c'est la session qui écrira (RLS). Table
     absente (0158 pas encore appliquée) ou lecture en échec → section masquée,
     rien d'inventé. Le plafond vient de la config en base, jamais d'ici. */
  const sessionDb = await createClient();
  const [{ data: svcRows, error: svcErr }, { data: svcCfg }] = await Promise.all([
    sessionDb.from("zabelie_seller_service_zones").select("zone_id").eq("seller_id", user.id),
    sessionDb.from("zabelie_service_zone_config").select("max_zones").maybeSingle(),
  ]);
  const zonesService = svcErr || zonesPourForm.length === 0 ? null : {
    initial: ((svcRows ?? []) as { zone_id: string }[]).map((l) => l.zone_id),
    max: (svcCfg as { max_zones: number } | null)?.max_zones ?? null,
  };

  return (
    <div className="bg-grain min-h-dvh">
      <SiteNav />
      <main id="main">
        <VendeurShell lang={lang} actif="boutique">
          <h1 className="text-2xl font-semibold sm:text-3xl">{t(lang, "shop.manage")}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-mist">{t(lang, "vendeur.boutique.intro")}</p>

          <section id="ma-boutique" aria-labelledby="ma-boutique-title" className="mt-6 scroll-mt-32 rounded-2xl border border-line bg-surface p-5">
            <h2 id="ma-boutique-title" className="titre-section">{t(lang, "vendeur.action.partager")}</h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-mist">{t(lang, "shop.hint")}</p>
            <Link href={hrefBoutique({ id: user.id, boutikSlug })} className="mt-3 inline-block break-all text-sm text-accent underline">
              {siteUrl()}{hrefBoutique({ id: user.id, boutikSlug })}
            </Link>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Link href={hrefBoutique({ id: user.id, boutikSlug })} className="bouton inline-flex min-h-11 items-center rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-on-brand">{t(lang, "shop.view")}</Link>
              <a href="#profil-public" className="inline-flex min-h-11 items-center px-2 text-sm text-cloud underline">{t(lang, "shop.edit")}</a>
            </div>
            <div className="mt-4 border-t border-line pt-4">
              <ShareButtons path={hrefBoutique({ id: user.id, boutikSlug })} text={t(lang, "creator.share.text", { name: profile.display_name })}
                waLabel={t(lang, "share.wa")} copyLabel={t(lang, "share.copy")} copiedLabel={t(lang, "share.copied")} />
            </div>
            {/* docs/75 §5.A (PR-Z1) : la même adresse, à imprimer ou à montrer. */}
            <div id="qr" className="mt-4 flex flex-wrap items-center gap-5 border-t border-line pt-4">
              {/* eslint-disable-next-line @next/next/no-img-element -- SVG en data: généré côté serveur, rien à optimiser */}
              <img src={qr.dataUrl} alt={t(lang, "vendeur.qr.alt", { url: qr.url })} width={160} height={160} className="size-40 rounded-lg border border-line" />
              <div className="min-w-0 max-w-sm">
                <h3 className="text-sm font-semibold">{t(lang, "vendeur.qr.titre")}</h3>
                <p className="mt-1 text-sm leading-relaxed text-mist">{t(lang, "vendeur.qr.aide")}</p>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <a href={qr.dataUrl} download={qr.fichier} className="bouton inline-flex min-h-11 items-center rounded-xl border border-line px-4 py-2 text-sm font-semibold text-accent">{t(lang, "vendeur.qr.telecharger")}</a>
                  <Link href="/tableau-de-bord/boutique/affiche" className="inline-flex min-h-11 items-center px-2 text-sm text-cloud underline">{t(lang, "vendeur.qr.affiche")}</Link>
                </div>
              </div>
            </div>
          </section>

          {mesure && (
            <section id="visites" aria-labelledby="visites-titre" className="mt-6 scroll-mt-32 rounded-2xl border border-line bg-surface p-5">
              <h2 id="visites-titre" className="titre-section">{t(lang, "vendeur.visites.titre")}</h2>
              <dl className="mt-3 grid gap-3 sm:grid-cols-3">
                {([
                  ["vendeur.visites.vues", String(mesure.vues)],
                  ["vendeur.visites.commandes", String(mesure.commandes)],
                  ["vendeur.visites.taux", mesure.pour100 === null ? "—"
                    : mesure.pour100.toLocaleString(LOCALE_DATE[lang], { minimumFractionDigits: 1, maximumFractionDigits: 1 })],
                ] as const).map(([cle, valeur]) => (
                  <div key={cle}>
                    <dt className="text-sm text-mist">{t(lang, cle)}</dt>
                    <dd className="mt-1 text-2xl font-semibold tabular-nums">{valeur}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-3 max-w-2xl text-xs leading-relaxed text-mist">{t(lang, "vendeur.visites.aide")}</p>
            </section>
          )}

          {/* Profil public */}
          <section id="profil-public" className="mt-10 scroll-mt-32">
            <div className="flex items-center justify-between">
              <h2 className="titre-section">{t(lang, "dashboard.profile.public")}</h2>
              <Link
                href={hrefBoutique({ id: user.id, boutikSlug })}
                className="inline-flex min-h-11 items-center text-sm text-mist transition hover:text-cloud"
              >
                {t(lang, "dashboard.profile.view")}
              </Link>
            </div>
            <div className="mt-4 max-w-lg rounded-2xl border border-line bg-surface/60 p-5">
              <ProfileForm
                key={user.id}
                actorId={user.id}
                initial={profile}
                zones={zonesPourForm}
                zoneLabels={zoneLabels}
                labels={{
                  name: t(lang, "profile.name"),
                  avatar: t(lang, "profile.avatar"),
                  country: t(lang, "profile.country"),
                  department: t(lang, "profile.department"),
                  bio: t(lang, "profile.bio"),
                  optional: t(lang, "profile.optional"),
                }}
              />
            </div>
          </section>

          {/* Zones de service (docs/77 §8) : « Ki kote ou livre ? » — déclaratif, Zabelie ne livre pas. */}
          {zonesService && (
            <section id="zones-service" aria-labelledby="zones-service-titre" className="mt-10 scroll-mt-32">
              <h2 id="zones-service-titre" className="titre-section">{t(lang, "svc.title")}</h2>
              <div className="mt-4 max-w-lg rounded-2xl border border-line bg-surface/60 p-5">
                <ServiceZonesEditor
                  zones={zonesPourForm}
                  initial={zonesService.initial}
                  max={zonesService.max}
                  labels={{
                    title: t(lang, "svc.title"),
                    hint: t(lang, "svc.hint"),
                    depatman: t(lang, "zone.level.depatman"),
                    komin: t(lang, "zone.level.komin"),
                    katye: t(lang, "zone.level.katye"),
                    allDepatman: t(lang, "svc.all.depatman"),
                    allKomin: t(lang, "svc.all.komin"),
                    add: t(lang, "svc.add"),
                    remove: t(lang, "svc.remove"),
                    empty: t(lang, "svc.empty"),
                    count: t(lang, "svc.count"),
                    save: t(lang, "svc.save"),
                    saving: t(lang, "svc.saving"),
                    saved: t(lang, "svc.saved"),
                    errGeneric: t(lang, "svc.err.generic"),
                    errMax: t(lang, "svc.err.max"),
                    errZone: t(lang, "svc.err.zone"),
                  }}
                />
              </div>
            </section>
          )}
        </VendeurShell>
      </main>
      <SiteFooter />
    </div>
  );
}
