import { Bouton } from "@/components/bouton";
import { SiteNav } from "@/components/site-nav";
import { getLang } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";

/* Titre d'onglet dans la langue de session, et le MÊME mot que la page :
   « non confirmé », pas « échoué » — le français fixe d'avant affirmait plus
   que le titre qu'il annonçait. Hors index, toujours (S12). */
export async function generateMetadata() {
  const lang = await getLang();
  return { title: `${t(lang, "pay.fail.title")} — Zabelie`, robots: { index: false, follow: false } };
}

export default async function EchecPage({
  searchParams,
}: {
  searchParams: Promise<{ raison?: string; produit?: string }>;
}) {
  const [{ raison, produit }, lang] = await Promise.all([
    searchParams,
    getLang(),
  ]);
  return (
    <div className="bg-grain min-h-dvh">
      <SiteNav />
      <main id="main" className="mx-auto max-w-md px-5 py-24 text-center">
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-danger text-ink">
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className="h-8 w-8 fill-none stroke-current"
            strokeWidth="2.5"
            strokeLinecap="round"
          >
            <path d="M7 7l10 10M17 7L7 17" />
          </svg>
        </span>
        <h1 className="mt-6 text-2xl font-extrabold">{t(lang, "pay.fail.title")}</h1>
        <p className="mt-3 text-mist">
          {t(lang, "pay.fail.body")}
        </p>
        {raison && <p className="mt-2 text-xs text-mist">{t(lang, "pay.fail.code")} {raison}</p>}
        {/* BL-111 (Stripe Checkout — « Try again » préserve l'intention) : le
            CTA primaire ramène au produit ; MonCash échoue souvent pour solde
            insuffisant → on le dit. Le catalogue devient secondaire. */}
        {produit && (
          <p className="mt-2 text-xs text-mist">{t(lang, "pay.checkBalance")}</p>
        )}
        <div className="mt-8 flex flex-col gap-3">
          {produit && (
            <Bouton href={`/produit/${encodeURIComponent(produit)}#acheter`}>
              {t(lang, "pay.retry")}
            </Bouton>
          )}
          {/* Un seul CTA orange par écran : le catalogue passe en secondaire
              dès que « Réessayer » existe. */}
          <Bouton href="/catalogue" variante={produit ? "secondaire" : "primaire"}>
            {t(lang, "pay.back")}
          </Bouton>
        </div>
      </main>
    </div>
  );
}
