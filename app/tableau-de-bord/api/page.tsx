import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { ApiKeysManager, type CleAffichee } from "@/components/api-keys-manager";
import { WebhooksManager, type EnvoiAffiche, type PointAffiche } from "@/components/webhooks-manager";
import { MAX_POINTS_ACTIFS } from "@/lib/webhooks";
import { PixelsForm } from "@/components/pixels-form";
import { DomainForm, type DomaineAffiche } from "@/components/domain-form";
import { getCurrentUser, requireLegalAccountPage } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { MAX_CLES_ACTIVES } from "@/lib/api-keys";
import { getLang } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";

export const dynamic = "force-dynamic";
export const metadata = { title: "API — Zabelie", robots: { index: false, follow: false } };

/**
 * /tableau-de-bord/api — les clés d'API du vendeur (0121).
 *
 * Lecture par la SESSION (RLS : ses clés seulement) ; création et révocation
 * passent par `/api/account/api-keys`. La clé en clair n'est jamais relue :
 * elle n'existe que dans la réponse de création.
 */
export default async function ApiPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/connexion?next=%2Ftableau-de-bord%2Fapi");
  await requireLegalAccountPage(user.id, "/tableau-de-bord/api");
  const lang = await getLang();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("zabelie_api_keys")
    .select("id, name, prefix, created_at, last_used_at, revoked_at")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error("api_keys_unavailable");
  // Le secret n'est PAS dans la liste : la colonne n'est pas accordée au vendeur (0122).
  const [{ data: pts, error: e1 }, { data: env, error: e2 }] = await Promise.all([
    supabase.from("zabelie_webhook_endpoints").select("id, url, events, created_at, disabled_at, disabled_reason").order("created_at", { ascending: false }).limit(20),
    supabase.from("zabelie_webhook_deliveries").select("id, event_type, status, attempts, last_status, created_at").order("created_at", { ascending: false }).limit(10),
  ]);
  if (e1 || e2) throw new Error("webhooks_unavailable");
  const { data: px, error: e3 } = await supabase.from("zabelie_seller_pixels").select("meta_pixel_id, google_tag_id, tiktok_pixel_id").maybeSingle();
  if (e3) throw new Error("pixels_unavailable");
  // Domaine personnalisé (0125) : lecture par la SESSION, RLS = sa ligne seulement.
  const { data: dom, error: e4 } = await supabase.from("zabelie_seller_domains").select("domaine, statut, note_admin").maybeSingle();
  if (e4) throw new Error("domain_unavailable");
  const domaine: DomaineAffiche = dom ? { domaine: dom.domaine, statut: dom.statut, note: dom.note_admin } : null;
  const points: PointAffiche[] = (pts ?? []).map((p) => ({ id: p.id, url: p.url, events: p.events, createdAt: p.created_at, disabledAt: p.disabled_at, disabledReason: p.disabled_reason }));
  const envois: EnvoiAffiche[] = (env ?? []).map((d) => ({ id: d.id, eventType: d.event_type, status: d.status, attempts: d.attempts, lastStatus: d.last_status, createdAt: d.created_at }));
  const cles: CleAffichee[] = (data ?? []).map((k) => ({
    id: k.id, name: k.name, prefix: k.prefix, createdAt: k.created_at, lastUsedAt: k.last_used_at, revokedAt: k.revoked_at,
  }));

  return (
    <>
      <SiteNav />
      <main id="main" className="mx-auto max-w-3xl px-4 py-8">
        <Link href="/tableau-de-bord" className="text-sm text-mist underline">← {t(lang, "shop.manage")}</Link>
        <h1 className="mt-3 text-2xl font-semibold">{t(lang, "apikeys.title")}</h1>
        <p className="mt-2 text-sm leading-relaxed text-mist">{t(lang, "apikeys.intro")}</p>
        <ApiKeysManager
          cles={cles}
          max={MAX_CLES_ACTIVES}
          locale={lang === "ht" ? "fr-HT" : lang}
          labels={{
            name: t(lang, "apikeys.name"),
            create: t(lang, "apikeys.create"),
            creating: t(lang, "apikeys.creating"),
            once: t(lang, "apikeys.once"),
            copy: t(lang, "common.copy"),
            copied: t(lang, "common.copied"),
            done: t(lang, "apikeys.done"),
            empty: t(lang, "apikeys.empty"),
            created: t(lang, "apikeys.created"),
            lastUsed: t(lang, "apikeys.lastUsed"),
            never: t(lang, "apikeys.never"),
            revoked: t(lang, "apikeys.revoked"),
            revoke: t(lang, "apikeys.revoke"),
            confirmRevoke: t(lang, "apikeys.confirmRevoke"),
            limit: t(lang, "apikeys.err.limit"),
            error: t(lang, "error.generic"),
          }}
        />
        <h2 id="webhooks" className="mt-12 scroll-mt-24 text-xl font-semibold">{t(lang, "webhooks.title")}</h2>
        <p className="mt-2 text-sm leading-relaxed text-mist">{t(lang, "webhooks.intro")}</p>
        <WebhooksManager
          points={points}
          envois={envois}
          max={MAX_POINTS_ACTIFS}
          locale={lang === "ht" ? "fr-HT" : lang}
          labels={{
            url: t(lang, "webhooks.url"), add: t(lang, "webhooks.add"), adding: t(lang, "webhooks.adding"),
            secretOnce: t(lang, "webhooks.secretOnce"), copy: t(lang, "common.copy"), copied: t(lang, "common.copied"),
            done: t(lang, "apikeys.done"), empty: t(lang, "webhooks.empty"), active: t(lang, "webhooks.active"),
            disabledSeller: t(lang, "webhooks.disabledSeller"), disabledFailures: t(lang, "webhooks.disabledFailures"),
            test: t(lang, "webhooks.test"), testSent: t(lang, "webhooks.testSent"), disable: t(lang, "webhooks.disable"),
            confirmDisable: t(lang, "webhooks.confirmDisable"), limit: t(lang, "webhooks.err.limit"), error: t(lang, "error.generic"),
            deliveries: t(lang, "webhooks.deliveries"), noDeliveries: t(lang, "webhooks.noDeliveries"), attempts: t(lang, "webhooks.attempts"),
            pending: t(lang, "webhooks.pending"), delivered: t(lang, "webhooks.delivered"), dead: t(lang, "webhooks.dead"),
          }}
        />
        <h2 id="pixels" className="mt-12 scroll-mt-24 text-xl font-semibold">{t(lang, "pixels.title")}</h2>
        <p className="mt-2 text-sm leading-relaxed text-mist">{t(lang, "pixels.intro")}</p>
        <PixelsForm
          initial={{ meta: px?.meta_pixel_id ?? "", google: px?.google_tag_id ?? "", tiktok: px?.tiktok_pixel_id ?? "" }}
          labels={{
            meta: t(lang, "pixels.meta"), google: t(lang, "pixels.google"), tiktok: t(lang, "pixels.tiktok"),
            metaHint: t(lang, "pixels.metaHint"), googleHint: t(lang, "pixels.googleHint"), tiktokHint: t(lang, "pixels.tiktokHint"),
            save: t(lang, "pixels.save"), saving: t(lang, "pixels.saving"), saved: t(lang, "pixels.saved"), error: t(lang, "error.generic"),
          }}
        />
        <h2 id="domaine" className="mt-12 scroll-mt-24 text-xl font-semibold">{t(lang, "domain.title")}</h2>
        <p className="mt-2 text-sm leading-relaxed text-mist">{t(lang, "domain.intro")}</p>
        <Link href="/tableau-de-bord#profil-public" className="mt-1 inline-block text-sm text-mist underline">{t(lang, "domain.kyc")}</Link>
        <DomainForm
          initial={domaine}
          labels={{
            label: t(lang, "domain.label"), save: t(lang, "domain.save"), saving: t(lang, "domain.saving"),
            remove: t(lang, "domain.remove"), confirmRemove: t(lang, "domain.confirmRemove"),
            pending: t(lang, "domain.pending"), active: t(lang, "domain.active"), refused: t(lang, "domain.refused"),
            dnsTitle: t(lang, "domain.dnsTitle"), dnsType: t(lang, "domain.dnsType"), dnsName: t(lang, "domain.dnsName"),
            dnsValue: t(lang, "domain.dnsValue"), dnsHelp: t(lang, "domain.dnsHelp"), error: t(lang, "error.generic"),
          }}
        />
      </main>
      <SiteFooter />
    </>
  );
}
