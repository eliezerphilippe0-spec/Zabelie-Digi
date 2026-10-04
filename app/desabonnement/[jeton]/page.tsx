import { t } from "@/lib/i18n";
import { getLang } from "@/lib/i18n-server";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";

export const metadata = { title: "Zabelie", robots: { index: false, follow: false } };

/** Désabonnement des relances de paiement (0124). Le bouton fait le geste : la page seule ne coupe rien. */
export default async function DesabonnementPage({
  params,
  searchParams,
}: {
  params: Promise<{ jeton: string }>;
  searchParams: Promise<{ ok?: string; invalide?: string }>;
}) {
  const lang = await getLang();
  const { jeton } = await params;
  const etat = await searchParams;
  return (
    <div className="bg-grain min-h-dvh">
      <SiteNav />
      <main id="main" className="mx-auto max-w-lg px-5 py-16">
        <h1 className="text-2xl font-black tracking-tight">{t(lang, "desabo.title")}</h1>
        {etat.ok ? (
          <p role="status" className="mt-4 text-mist">{t(lang, "desabo.done")}</p>
        ) : etat.invalide ? (
          <p role="status" className="mt-4 text-mist">{t(lang, "desabo.invalid")}</p>
        ) : (
          <form method="post" action="/api/desabonnement" className="mt-4">
            <p className="text-mist">{t(lang, "desabo.body")}</p>
            <input type="hidden" name="jeton" value={jeton} />
            <button type="submit" className="bouton mt-6 inline-flex min-h-11 items-center rounded-xl bg-brand px-5 font-semibold text-on-brand">
              {t(lang, "desabo.button")}
            </button>
          </form>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
