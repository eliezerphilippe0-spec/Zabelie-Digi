import Link from "next/link";
import { SiteNav } from "@/components/site-nav";
import { getLang } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";

export const metadata = { title: "Page introuvable — Zabelie" };

/**
 * 404 global. Composant SERVEUR : il peut donc lire `getLang()` et `t()`
 * normalement, contrairement à `app/error.tsx` (voir le commentaire là-bas).
 *
 * POURQUOI CET ÉCRAN EXISTE
 * Sans ce fichier, une URL inexistante affichait l'écran par défaut de Next.js :
 * anglais, hors charte, sans lien de retour. Sur un Android d'entrée de gamme
 * en réseau instable, c'est l'un des écrans les plus vus après les pages
 * elles-mêmes — un lien ancien partagé sur WhatsApp suffit.
 *
 * DEUX SORTIES, PAS UNE. Un cul-de-sac traduit reste un cul-de-sac : l'accueil
 * pour qui s'est perdu, le catalogue pour qui cherchait un produit.
 */
export default async function NotFound() {
  const lang = await getLang();
  return (
    <div className="bg-grain min-h-dvh">
      <SiteNav />
      <main id="main" className="mx-auto max-w-md px-5 py-24 text-center">
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-full border border-line text-2xl text-mist">
          ?
        </span>
        <h1 className="mt-6 text-2xl font-extrabold">
          {t(lang, "err.404.title")}
        </h1>
        <p className="mt-3 text-mist">{t(lang, "err.404.body")}</p>
        <div className="mt-8 flex flex-col gap-3">
          <Link
            href="/"
            className="rounded-xl bg-brand px-6 py-3 text-sm font-semibold text-on-brand"
          >
            {t(lang, "err.404.home")}
          </Link>
          <Link
            href="/catalogue"
            className="rounded-xl border border-line px-6 py-3 text-sm font-semibold text-cloud"
          >
            {t(lang, "err.404.catalog")}
          </Link>
        </div>
      </main>
    </div>
  );
}
