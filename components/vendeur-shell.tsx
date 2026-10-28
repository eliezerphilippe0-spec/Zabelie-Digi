import Link from "next/link";
import type { ReactNode } from "react";
import { t, type Lang } from "@/lib/i18n";
import { studioProvider } from "@/lib/studio-server";
import { creationActive, lireEnvCreation } from "@/lib/digital-authoring/flags";
import { copieCreation } from "@/lib/digital-authoring/copy";
import { IconeStudio, type NomIcone } from "@/components/studio-icones";

/**
 * Cadre des pages du tableau vendeur (docs/73, façon Chariow) : un menu à
 * icônes à gauche sur ordinateur, une rangée d'onglets défilante sur
 * téléphone, le contenu à droite. Même dessin que le menu du Studio
 * (`studio-shell.tsx`). Composant serveur, sans JavaScript.
 *
 * Le menu ne mène qu'à des pages qui existent. Les deux Studios et l'API
 * suivent le même prédicat que leurs pages et leurs routes : éteints, ils
 * disparaissent du menu au lieu de mener à un 404.
 */
export type RubriqueVendeur = "accueil" | "produits" | "clients" | "promo" | "affiliation" | "boutique" | "compte";

type Lien = { cle: string; href: string; texte: string; icone: NomIcone };

export function VendeurShell({
  lang,
  actif,
  children,
}: {
  lang: Lang;
  actif: RubriqueVendeur;
  children: ReactNode;
}) {
  const principaux: Lien[] = [
    { cle: "accueil", href: "/tableau-de-bord", texte: t(lang, "vendeur.nav.accueil"), icone: "accueil" },
    { cle: "produits", href: "/vendre#mes-produits", texte: t(lang, "vendeur.nav.produits"), icone: "produits" },
    { cle: "commandes", href: "/mes-ventes", texte: t(lang, "vendeur.nav.commandes"), icone: "commandes" },
    { cle: "clients", href: "/tableau-de-bord/clients", texte: t(lang, "vendeur.nav.clients"), icone: "clients" },
    { cle: "promo", href: "/tableau-de-bord/codes-promo", texte: t(lang, "vendeur.nav.promo"), icone: "promo" },
    { cle: "affiliation", href: "/tableau-de-bord/affiliation", texte: t(lang, "vendeur.nav.affiliation"), icone: "partage" },
    { cle: "messages", href: "/messages", texte: t(lang, "vendeur.nav.messages"), icone: "messages" },
    { cle: "boutique", href: "/tableau-de-bord/boutique", texte: t(lang, "shop.manage"), icone: "boutique" },
    { cle: "compte", href: "/tableau-de-bord/compte", texte: t(lang, "vendeur.nav.compte"), icone: "compte" },
  ];
  const outils: Lien[] = [
    ...(creationActive(lireEnvCreation())
      ? [{ cle: "creation", href: "/tableau-de-bord/creation", texte: copieCreation(lang).lien, icone: "nouveau" as const }]
      : []),
    ...(studioProvider()
      ? [{ cle: "studio", href: "/tableau-de-bord/studio", texte: t(lang, "estidyo.lien"), icone: "images" as const }]
      : []),
    { cle: "api", href: "/tableau-de-bord/api", texte: t(lang, "apikeys.link"), icone: "api" },
    { cle: "aide", href: "/aide", texte: t(lang, "vendeur.nav.aide"), icone: "aide" },
  ];
  const lien = (l: Lien) => (
    <li key={l.cle} className="shrink-0">
      <Link
        href={l.href}
        aria-current={l.cle === actif ? "page" : undefined}
        className="flex min-h-11 items-center gap-2.5 whitespace-nowrap rounded-full border border-line px-4 text-sm text-mist aria-[current=page]:border-cloud aria-[current=page]:bg-cloud aria-[current=page]:font-semibold aria-[current=page]:text-ink lg:rounded-xl lg:border-transparent lg:px-3 lg:text-cloud lg:hover:bg-line/40 lg:aria-[current=page]:border-transparent lg:aria-[current=page]:bg-line/60 lg:aria-[current=page]:text-cloud"
      >
        <IconeStudio nom={l.icone} className="hidden h-5 w-5 lg:block" />
        {l.texte}
      </Link>
    </li>
  );
  return (
    <div className="mx-auto max-w-6xl px-5 py-6 lg:grid lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-10 lg:py-8">
      <nav aria-label={t(lang, "vendeur.menu")} className="min-w-0 lg:sticky lg:top-24 lg:self-start">
        <ul className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-3 lg:mx-0 lg:flex-col lg:gap-1 lg:overflow-visible lg:px-0 lg:pb-0">
          {principaux.map(lien)}
          <li aria-hidden="true" className="hidden lg:my-2 lg:block lg:border-t lg:border-line" />
          {outils.map(lien)}
        </ul>
      </nav>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
