import Link from "next/link";
import { DepartmentIcon } from "@/components/department-icons";
import type { RayonMenu } from "@/lib/taxonomy";

/**
 * Rangée de CHIPS des rayons, dans l'en-tête (brief accueil premium §4.1).
 *
 * Remplace la ligne « Rayons · Catalogue · Talents · Aide » ET le bandeau de
 * catégories de l'accueil. Défile horizontalement, sans JavaScript.
 *
 * RÈGLE : n'affiche QUE les rayons qui ont au moins un produit publié
 * (`!r.vide`, calculé par `getMenuRayons` avec remontée des sous-rayons).
 * Le mot « bientôt » n'apparaît plus : si des rayons sont vides, UNE ligne
 * discrète le dit en fin de rangée (`labels.more`, « Lòt rayon ap vini »).
 * Elle est dans la rangée et non dessous pour tenir l'en-tête sous 100 px
 * (critère A2) — un écart de forme avec le brief §4.3, mesuré et assumé.
 *
 * À catalogue entièrement vide, la rangée porte quand même le chip
 * « Catalogue » : la destination est honnête (l'écran « rayon en ouverture »
 * du catalogue), et un en-tête sans aucun repère de navigation serait pire.
 */
export function CategoryChips({
  rayons,
  labels,
}: {
  rayons: RayonMenu[];
  labels: { all: string; more: string; nav: string };
}) {
  const pleins = rayons.filter((r) => !r.vide);
  const desVides = rayons.some((r) => r.vide);

  return (
    <nav
      aria-label={labels.nav}
      className="header-fold -mx-3 overflow-x-auto px-3 pb-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <ul className="flex items-center gap-2 whitespace-nowrap">
        {pleins.map((r) => (
          <li key={r.slug}>
            <Link
              href={r.href}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-on-chrome/25 px-3 text-sm font-medium text-on-chrome transition hover:border-on-chrome/60 active:scale-[0.97]"
            >
              <DepartmentIcon slug={r.slug} className="h-4 w-4 stroke-on-chrome" />
              {r.label}
            </Link>
          </li>
        ))}
        <li>
          <Link
            href="/catalogue"
            className="inline-flex min-h-11 items-center rounded-full border border-on-chrome/25 px-3 text-sm font-medium text-on-chrome transition hover:border-on-chrome/60 active:scale-[0.97]"
          >
            {labels.all}
          </Link>
        </li>
        {desVides && (
          <li className="pl-1 text-xs text-on-chrome">{labels.more}</li>
        )}
      </ul>
    </nav>
  );
}
