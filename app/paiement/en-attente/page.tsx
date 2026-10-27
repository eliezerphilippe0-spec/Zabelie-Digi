import { Bouton } from "@/components/bouton";
import { SiteNav } from "@/components/site-nav";
import { OrderStatusPoll, OrderPaymentRecovery } from "@/components/order-status-poll";
import { marketplaceCopy } from "@/lib/marketplace-copy";
import { getLang } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";

export const dynamic = "force-dynamic";
/* Titre d'onglet dans la langue de session (audit du système de design,
   m10) ; hors index, toujours (S12). */
export async function generateMetadata() {
  const lang = await getLang();
  return { title: `${t(lang, "pay.wait.title")} — Zabelie`, robots: { index: false, follow: false } };
}

export default async function EnAttentePage({
  searchParams,
}: {
  searchParams: Promise<{ commande?: string }>;
}) {
  const [{ commande }, lang] = await Promise.all([searchParams, getLang()]);
  return (
    <div className="bg-grain min-h-dvh">
      <SiteNav />
      {/* BL-132 (FRONT-4) : quand l'orderId est connu (retour MonCash avec
          erreur transitoire à la confirmation), on poll au lieu de laisser
          l'acheteur planté sur une page statique — pattern /rechaj déjà en
          place. Invisible : ne change rien tant que rien n'est tranché. */}
      {commande && <OrderStatusPoll orderId={commande} />}
      <main id="main" className="mx-auto max-w-md px-5 py-24 text-center">
        {/* Une horloge tracée, pas l'emoji ⏳ : il s'affichait en couleur, ou en
            carré vide, selon la police du téléphone. */}
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-warning text-ink">
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className="h-8 w-8 fill-none stroke-current"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="8.5" />
            <path d="M12 7.5V12l3 2" />
          </svg>
        </span>
        <h1 className="mt-6 text-2xl font-extrabold">{t(lang, "pay.wait.title")}</h1>
        <p className="mt-3 text-mist">
          {t(lang, "pay.wait.body")}
        </p>
        {/* L'escrow dit là où l'acheteur vient d'avancer son argent et attend
            (audit REA #5, ampleur checkout). product.protege est money-framed
            et vrai pour tous les kinds (maturation J+7) : pas de gate par type
            ici, la page ignore le kind et la phrase reste vraie partout. */}
        <p className="mt-4 text-sm text-mist">{t(lang, "product.protege")}</p>
        <div className="mt-8 flex flex-col gap-3">
          {commande && <OrderPaymentRecovery orderId={commande} labels={marketplaceCopy(lang)} />}
          <Bouton href="/mes-achats" variante="secondaire">
            {t(lang, "pay.wait.cta")}
          </Bouton>
          <Bouton href="/catalogue" variante="discret">
            {t(lang, "pay.back")}
          </Bouton>
        </div>
      </main>
    </div>
  );
}
