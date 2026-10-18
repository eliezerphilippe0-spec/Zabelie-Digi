import Link from "next/link";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { VendeurShell } from "@/components/vendeur-shell";
import { ShareButtons } from "@/components/share-buttons";
import { ProfileForm } from "@/components/profile-form";
import { createAdminClient } from "@/lib/supabase/admin";
import { vendeurOuRedirection } from "@/lib/vendeur-acces";
import { getZonesActives, libelleZone } from "@/lib/zones";
import { siteUrl } from "@/lib/site-url";
import { hrefBoutique } from "@/lib/boutique-href";
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

  return (
    <div className="bg-grain min-h-dvh">
      <SiteNav />
      <main id="main">
        <VendeurShell lang={lang} actif="boutique">
          <h1 className="text-2xl font-semibold sm:text-3xl">{t(lang, "shop.manage")}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-mist">{t(lang, "vendeur.boutique.intro")}</p>

          <section id="ma-boutique" aria-labelledby="ma-boutique-title" className="mt-6 scroll-mt-28 rounded-2xl border border-line bg-surface p-5">
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
          </section>

          {/* Profil public */}
          <section id="profil-public" className="mt-10 scroll-mt-28">
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
        </VendeurShell>
      </main>
      <SiteFooter />
    </div>
  );
}
