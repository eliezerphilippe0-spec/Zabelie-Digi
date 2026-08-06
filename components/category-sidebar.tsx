import Link from "next/link";
import type { RayonMenu } from "@/lib/taxonomy";
import { DepartmentIcon } from "@/components/department-icons";

/**
 * Colonne des rayons — desktop uniquement (`hidden lg:block` au site d'appel).
 *
 * SERVEUR, zéro JS : chaque département est un `<details>` natif — sémantique
 * d'accordéon réelle (Enter/Espace, état exposé aux lecteurs d'écran) sans un
 * octet d'hydratation. Un mega-menu au survol a été écarté sciemment : le
 * survol n'existe pas au clavier ni au tactile, et l'ARIA nécessaire pèserait
 * plus que la fonctionnalité. `<details>` donne les deux gratuitement.
 *
 * Les données sont les mêmes que le menu mobile (`getMenuRayons`) : rayons
 * ACTIFS seulement — c'est la décision porteur du 2026-08-02 (afficher tout
 * ce qui est ouvert, MARQUER les vides, ne jamais lier un rayon désert) posée
 * sur l'arbitrage des vagues de docs/16 (un département fermé n'existe pas
 * pour le client). Le « 16 départements visibles » de la maquette se lit donc
 * « tous les départements OUVERTS » ; en ouvrir un = un UPDATE en base.
 */
export type SidebarLabels = {
  /** Titre de la colonne, ex. « Kategori yo ». */
  title: string;
  /** Marque des rayons sans produit, ex. « bientôt ». */
  empty: string;
  /** Lien de pied, ex. « Tout le catalogue → ». */
  all: string;
};

export function CategorySidebar({
  rayons,
  labels,
}: {
  rayons: RayonMenu[];
  labels: SidebarLabels;
}) {
  // Aucun rayon actif : rien du tout — la règle de CategoryMenu, à l'identique.
  if (rayons.length === 0) return null;

  return (
    <nav
      aria-label={labels.title}
      className="rounded-2xl border border-line bg-surface/40 p-2"
    >
      <p className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wider text-mist">
        {labels.title}
      </p>
      <ul>
        {rayons.map((r) => (
          <li key={r.slug}>
            {r.enfants.length === 0 ? (
              <RangDepartement rayon={r} empty={labels.empty} />
            ) : (
              <details className="group">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-lg px-3 py-2.5 hover:bg-black/20 [&::-webkit-details-marker]:hidden">
                  <span className="flex min-w-0 items-center gap-2.5">
                    <DepartmentIcon slug={r.slug} className="h-4 w-4 shrink-0 stroke-mist" />
                    <span className={`truncate text-sm ${r.vide ? "text-mist/50" : "text-cloud"}`}>
                      {r.label}
                      {r.vide && (
                        <span className="ml-2 text-xs text-mist/60">{labels.empty}</span>
                      )}
                    </span>
                  </span>
                  <span
                    aria-hidden="true"
                    className="shrink-0 text-mist transition group-open:rotate-180"
                  >
                    ▾
                  </span>
                </summary>
                <ul className="ml-5 border-l border-line pl-3 pb-1">
                  {/* Le département lui-même reste atteignable une fois ouvert */}
                  {!r.vide && (
                    <li>
                      <Link
                        href={r.href}
                        className="block rounded-lg px-2 py-2 text-sm font-semibold text-cloud hover:text-brand"
                      >
                        {r.label} →
                      </Link>
                    </li>
                  )}
                  {r.enfants.map((e) => (
                    <li key={e.slug}>
                      {e.vide ? (
                        <span aria-disabled="true" className="block px-2 py-2 text-sm text-mist/50">
                          {e.label}
                          <span className="ml-2 text-xs text-mist/60">{labels.empty}</span>
                        </span>
                      ) : (
                        <Link
                          href={e.href}
                          className="block rounded-lg px-2 py-2 text-sm text-mist hover:bg-black/20 hover:text-cloud"
                        >
                          {e.label}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </li>
        ))}
      </ul>
      <Link
        href="/catalogue"
        className="mt-1 block border-t border-line px-3 py-2.5 text-sm font-semibold text-brand"
      >
        {labels.all}
      </Link>
    </nav>
  );
}

/** Département sans enfants : un rang simple, lié ou marqué. */
function RangDepartement({ rayon, empty }: { rayon: RayonMenu; empty: string }) {
  const contenu = (
    <>
      <DepartmentIcon slug={rayon.slug} className="h-4 w-4 shrink-0 stroke-mist" />
      <span className="truncate text-sm">
        {rayon.label}
        {rayon.vide && <span className="ml-2 text-xs text-mist/60">{empty}</span>}
      </span>
    </>
  );
  return rayon.vide ? (
    <span
      aria-disabled="true"
      className="flex items-center gap-2.5 px-3 py-2.5 text-mist/50"
    >
      {contenu}
    </span>
  ) : (
    <Link
      href={rayon.href}
      className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-cloud hover:bg-black/20"
    >
      {contenu}
    </Link>
  );
}
