import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import { BoutonReessayer } from "@/components/bouton-reessayer";
import { getLang } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";

export const metadata = {
  title: "Hors réseau — Zabelie",
};

/**
 * CE QUE VOIT UN ACHETEUR QUAND LE RÉSEAU TOMBE.
 *
 * Sans elle, Chrome affiche son dinosaure : une page de navigateur, en
 * anglais, qui ne dit rien du site qu'on essayait d'ouvrir. Sur un terrain à
 * coupures fréquentes, c'est la panne la plus banale du produit — et jusqu'ici
 * la seule qui n'avait aucun écran.
 *
 * ⚠️ PAS DE `SiteNav` ICI, ET C'EST VOULU. La barre de navigation lit les
 * catégories en base et l'état de session : hors réseau, ces lectures
 * échouent. Une page de secours qui dépend de ce qui vient de tomber n'est pas
 * une page de secours. Le pied de page, lui, ne lit que la langue.
 */
export default async function HorsLignePage() {
  const lang = await getLang();

  return (
    <div className="bg-grain flex min-h-dvh flex-col">
      <main id="main" className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-5 py-16 text-center">
        <h1 className="text-2xl font-black tracking-tight">
          {t(lang, "offline.title")}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-mist">
          {t(lang, "offline.body")}
        </p>
        <div className="mt-8 flex flex-col gap-3">
          <BoutonReessayer libelle={t(lang, "offline.retry")} />
          <Link
            href="/"
            className="rounded-xl border border-line px-5 py-3 text-sm font-semibold text-cloud"
          >
            {t(lang, "offline.home")}
          </Link>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
