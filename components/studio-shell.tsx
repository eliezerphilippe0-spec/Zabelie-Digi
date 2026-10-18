import Link from "next/link";
import type { ReactNode } from "react";
import type { CopieCreation } from "@/lib/digital-authoring/copy";
import type { CopieVentes } from "@/lib/digital-authoring/copy-ventes";
import { IconeStudio, type NomIcone } from "@/components/studio-icones";

/**
 * Cadre des pages du Studio (tasks/plan.md, tâche T.2 ; disposition inspirée
 * du tableau de CreateurSuite, demande du porteur du 2026-10-16 ; icônes et
 * second groupe de liens repris de Chariow, phase T2 du 2026-10-17) : un menu
 * à gauche sur ordinateur, une rangée d'onglets défilante sur téléphone, le
 * contenu à droite. Composant serveur, sans JavaScript.
 *
 * Le menu ne mène qu'à des pages qui existent : pas d'entrée vers une
 * fonction absente. Le second groupe sort du Studio vers des pages vendeur
 * déjà en ligne (ventes, revenus, aide) ; Chariow y met aussi le marketing,
 * l'affiliation et les automatisations, que Zabelie n'a pas ici.
 */
export type RubriqueStudio = "accueil" | "analyse";

type Lien = { cle: string; href: string; texte: string; icone: NomIcone };

export function StudioShell({
  labels,
  ventes,
  actif,
  retour,
  quota,
  children,
}: {
  labels: CopieCreation;
  ventes: CopieVentes;
  actif: RubriqueStudio;
  /** Libellé du retour au tableau de bord vendeur. */
  retour: string;
  /** Suggestions restantes du jour, quand l'IA est disponible. */
  quota: { restantes: number; maximum: number; texte: string } | null;
  children: ReactNode;
}) {
  const t = labels.tableau;
  const studio: Lien[] = [
    { cle: "accueil", href: "/tableau-de-bord/creation", texte: t.navAccueil, icone: "accueil" },
    { cle: "analyse", href: "/tableau-de-bord/creation/analyse", texte: t.navAnalyse, icone: "analyse" },
    { cle: "projets", href: "/tableau-de-bord/creation#mes-projets", texte: t.navProjets, icone: "projets" },
    { cle: "nouveau", href: "/tableau-de-bord/creation?depart=vide#nouveau-projet", texte: t.navNouveau, icone: "nouveau" },
  ];
  const vendeur: Lien[] = [
    { cle: "ventes", href: "/mes-ventes", texte: ventes.navVentes, icone: "ventes" },
    { cle: "revenus", href: "/tableau-de-bord", texte: ventes.navRevenus, icone: "revenus" },
    { cle: "aide", href: "/aide", texte: ventes.navAide, icone: "aide" },
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
      <nav aria-label={t.menu} className="min-w-0 lg:sticky lg:top-24 lg:self-start">
        <ul className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-3 lg:mx-0 lg:flex-col lg:gap-1 lg:overflow-visible lg:px-0 lg:pb-0">
          {studio.map(lien)}
          <li aria-hidden="true" className="hidden lg:my-2 lg:block lg:border-t lg:border-line" />
          {vendeur.map(lien)}
        </ul>
        {quota && (
          <div className="mt-6 hidden rounded-2xl border border-line p-3 lg:block">
            <p className="text-xs text-mist">{quota.texte}</p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line" aria-hidden="true">
              <div className="h-full rounded-full bg-brand" style={{ width: `${quota.maximum ? Math.round((quota.restantes / quota.maximum) * 100) : 0}%` }} />
            </div>
          </div>
        )}
        <Link href="/tableau-de-bord" className="mt-4 hidden min-h-11 items-center text-sm text-mist underline lg:inline-flex">
          ← {retour}
        </Link>
      </nav>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
