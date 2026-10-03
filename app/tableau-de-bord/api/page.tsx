import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { ApiKeysManager, type CleAffichee } from "@/components/api-keys-manager";
import { getCurrentUser } from "@/lib/auth";
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
  const lang = await getLang();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("zabelie_api_keys")
    .select("id, name, prefix, created_at, last_used_at, revoked_at")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error("api_keys_unavailable");
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
      </main>
      <SiteFooter />
    </>
  );
}
