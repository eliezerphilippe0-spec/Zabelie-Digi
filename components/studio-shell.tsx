import Link from "next/link";
import type { ReactNode } from "react";
import type { CopieCreation } from "@/lib/digital-authoring/copy";

/**
 * Cadre des pages du Studio (tasks/plan.md, tâche T.2 ; disposition inspirée
 * du tableau de CreateurSuite, demande du porteur du 2026-10-16) : un menu à
 * gauche sur ordinateur, une rangée d'onglets défilante sur téléphone, le
 * contenu à droite. Composant serveur, sans JavaScript. La pastille active
 * reprend celle du catalogue (`app/catalogue/page.tsx`).
 *
 * Le menu ne mène qu'à des pages qui existent : pas d'entrée vers une
 * fonction absente.
 */
export type RubriqueStudio = "accueil" | "analyse";

export function StudioShell({
  labels,
  actif,
  retour,
  quota,
  children,
}: {
  labels: CopieCreation;
  actif: RubriqueStudio;
  /** Libellé du retour au tableau de bord vendeur. */
  retour: string;
  /** Suggestions restantes du jour, quand l'IA est disponible. */
  quota: { restantes: number; maximum: number; texte: string } | null;
  children: ReactNode;
}) {
  const t = labels.tableau;
  const liens: { cle: RubriqueStudio | "projets" | "nouveau"; href: string; texte: string }[] = [
    { cle: "accueil", href: "/tableau-de-bord/creation", texte: t.navAccueil },
    { cle: "analyse", href: "/tableau-de-bord/creation/analyse", texte: t.navAnalyse },
    { cle: "projets", href: "/tableau-de-bord/creation#mes-projets", texte: t.navProjets },
    { cle: "nouveau", href: "/tableau-de-bord/creation?depart=vide#nouveau-projet", texte: t.navNouveau },
  ];
  return (
    <div className="mx-auto max-w-6xl px-5 py-6 lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-10 lg:py-8">
      <nav aria-label={t.menu} className="min-w-0 lg:sticky lg:top-24 lg:self-start">
        <ul className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-3 lg:mx-0 lg:flex-col lg:gap-1 lg:overflow-visible lg:px-0 lg:pb-0">
          {liens.map((l) => (
            <li key={l.cle} className="shrink-0">
              <Link
                href={l.href}
                aria-current={l.cle === actif ? "page" : undefined}
                className="flex min-h-11 items-center whitespace-nowrap rounded-full border border-line px-4 text-sm text-mist aria-[current=page]:border-cloud aria-[current=page]:bg-cloud aria-[current=page]:font-semibold aria-[current=page]:text-ink lg:rounded-lg lg:border-transparent lg:px-3 lg:text-cloud lg:aria-[current=page]:border-transparent lg:aria-[current=page]:bg-surface lg:aria-[current=page]:text-cloud"
              >
                {l.texte}
              </Link>
            </li>
          ))}
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
