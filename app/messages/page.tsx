import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/products";
import { getLang } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";
import { lireFils } from "@/lib/messagerie";

export const dynamic = "force-dynamic";

/**
 * La boîte — les deux rôles dans une seule liste.
 *
 * ⚠️ PAS DEUX ONGLETS « ACHATS » / « VENTES », et c'est une décision. Une
 * conversation ne change pas de nature selon le côté d'où on la regarde ;
 * séparer obligerait à deviner dans quel onglet une réponse est arrivée. Le
 * rôle est marqué SUR chaque ligne, ce qui suffit à s'orienter et ne coupe
 * rien en deux.
 */
export default async function MessagesPage() {
  const lang = await getLang();

  if (!isSupabaseConfigured()) redirect("/connexion");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion?next=/messages");

  /* La RLS fait le tri : `auth.uid() = buyer_id or auth.uid() = seller_id`.
   * Aucun filtre applicatif — voir `lib/messagerie.ts` pour pourquoi ce n'est
   * PAS le cas de `get_user_orders` de l'API v1, où il en fallait un. */
  const fils = await lireFils(supabase, user.id);

  return (
    <div className="bg-grain min-h-dvh">
      <SiteNav />
      <main id="main" className="mx-auto max-w-3xl px-5 pb-16 pt-10">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          {t(lang, "msg.title")}
        </h1>

        {fils.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-line bg-surface/40 p-6">
            <p className="text-cloud">{t(lang, "msg.empty")}</p>
            {/* L'écran vide DIT quoi faire. Un vide muet se lit comme une
                panne — c'est la règle des états zéro du dépôt. */}
            <p className="mt-2 text-sm text-mist">{t(lang, "msg.empty.hint")}</p>
            <Link
              href="/catalogue"
              className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-on-brand"
            >
              {t(lang, "nav.catalog")}
            </Link>
          </div>
        ) : (
          <ul className="mt-6 flex flex-col gap-3">
            {fils.map((f) => (
              <li key={f.id}>
                <Link
                  href={`/messages/${f.id}`}
                  className="flex min-h-11 items-start gap-3 rounded-2xl border border-line bg-surface/40 p-4 transition hover:border-brand/60"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-cloud">{f.productTitle}</p>
                    <p className="mt-1 truncate text-sm text-mist">
                      {f.autreNom} ·{" "}
                      {t(lang, f.jeSuisAcheteur ? "msg.role.buyer" : "msg.role.seller")}
                    </p>
                  </div>
                  {f.nonLu && (
                    <span className="shrink-0 rounded-full bg-brand px-2 py-0.5 text-xs font-semibold text-on-brand">
                      {t(lang, "msg.unread")}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
