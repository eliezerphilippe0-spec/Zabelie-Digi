"use client";

import { useState } from "react";
import Link from "next/link";
import type { RayonMenu } from "@/lib/taxonomy";

/**
 * Menu déroulant des rayons — maquette porteur du 2026-08-02.
 *
 * Composant CLIENT : il faut un état d'ouverture. Ses libellés arrivent donc
 * en PROPS depuis le parent serveur, jamais par `t()` — règle en tête de
 * `lib/i18n.ts`, vérifiée par `tests/i18n-client-discipline.test.ts`.
 *
 * CE QUE FAIT LE MARQUAGE DES RAYONS VIDES, ET POURQUOI IL EST STRUCTUREL
 * ----------------------------------------------------------------------
 * Un rayon sans produit n'est PAS un lien. Ni `<Link>`, ni `href`, ni curseur
 * de main : `<span>` avec `aria-disabled`. Griser un lien qu'on peut quand
 * même suivre ne fait que retarder l'impasse d'un clic — et sur un forfait
 * data compté à la gourde, ce clic se paie.
 *
 * L'étendue prévue du catalogue reste visible : c'est la décision porteur
 * (afficher tout, marquer les vides) plutôt que masquer, parce qu'un menu à
 * quatre entrées ferait croire que Zabelie ne vendra jamais que ça.
 */
export type MenuLabels = {
  /** Bouton d'ouverture, ex. « Rayons ». */
  title: string;
  /** Suffixe des rayons sans produit, ex. « bientôt ». */
  empty: string;
  /** Libellé du lien « tout le catalogue ». */
  all: string;
};

function Rayon({
  rayon,
  labels,
  niveau,
}: {
  rayon: RayonMenu;
  labels: MenuLabels;
  niveau: number;
}) {
  const [ouvert, setOuvert] = useState(false);
  const aDesEnfants = rayon.enfants.length > 0;

  // Le libellé, identique qu'il soit cliquable ou non — c'est l'état qui
  // change, pas le texte.
  const texte = (
    <>
      {rayon.label}
      {rayon.vide && (
        <span className="ml-2 text-xs text-mist/70">{labels.empty}</span>
      )}
    </>
  );

  return (
    <li>
      <div className="flex items-center justify-between gap-2">
        {rayon.vide ? (
          <span
            aria-disabled="true"
            className="block flex-1 py-3 text-mist/50"
          >
            {texte}
          </span>
        ) : (
          <Link
            // `rayon.href` est calculé par `construireMenu` : c'est lui qui
            // connaît le `label_fr` du département que la page catalogue
            // filtre. L'ancien `?cat=<slug>` rendait toujours zéro résultat.
            href={rayon.href}
            className="block flex-1 py-3 text-cloud hover:text-brand"
          >
            {texte}
          </Link>
        )}

        {aDesEnfants && (
          // Zone tactile ~44 px (BL-124) : sur Android d'entrée de gamme, un
          // chevron de 16 px est intouchable.
          <button
            type="button"
            onClick={() => setOuvert((v) => !v)}
            aria-expanded={ouvert}
            aria-label={rayon.label}
            className="grid h-11 w-11 shrink-0 place-items-center text-mist"
          >
            <span className={ouvert ? "rotate-180 transition" : "transition"}>
              ▾
            </span>
          </button>
        )}
      </div>

      {aDesEnfants && ouvert && (
        <ul className={niveau === 1 ? "ml-4 border-l border-line pl-3" : "ml-3"}>
          {rayon.enfants.map((e) => (
            <Rayon key={e.slug} rayon={e} labels={labels} niveau={niveau + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

export function CategoryMenu({
  rayons,
  labels,
}: {
  rayons: RayonMenu[];
  labels: MenuLabels;
}) {
  const [ouvert, setOuvert] = useState(false);

  // Aucun rayon actif : on ne rend RIEN plutôt qu'un bouton qui ouvre du vide.
  // Même règle que `HomeRow` (V-13) — un menu vide n'est pas un menu.
  if (rayons.length === 0) return null;

  return (
    // Escape ferme — capté sur le conteneur : il reçoit l'événement tant que
    // le focus est dans le panneau, sans écouteur global à démonter.
    <div className="relative" onKeyDown={(e) => e.key === "Escape" && setOuvert(false)}>
      <button
        type="button"
        onClick={() => setOuvert((v) => !v)}
        aria-expanded={ouvert}
        className="rounded-md px-3 py-2 text-sm text-mist transition hover:text-cloud"
      >
        {labels.title} <span aria-hidden="true">▾</span>
      </button>

      {ouvert && (
        <>
          {/* Voile mobile : un tap dehors ferme. `aria-hidden` — le vrai
              contrôle de fermeture reste le bouton, atteignable au clavier. */}
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            onClick={() => setOuvert(false)}
            className="fixed inset-0 z-40 bg-black/60 md:hidden"
          />
          {/* Sous md : tiroir plein écran ancré à gauche (le geste maquette).
              Dès md : le même panneau redevient une liste déroulante. */}
          <div className="fixed inset-y-0 left-0 z-50 w-[85vw] max-w-sm overflow-y-auto border-r border-line bg-surface p-3 md:absolute md:inset-auto md:left-0 md:z-50 md:mt-1 md:max-h-[70vh] md:w-72 md:rounded-xl md:border md:p-2 md:shadow-xl">
            <div className="mb-1 flex items-center justify-between md:hidden">
              <p className="px-1 text-sm font-semibold text-cloud">{labels.title}</p>
              {/* 44×44 (BL-124) et libellé du bouton d'ouverture réutilisé :
                  pas de nouvelle clé pour un « × » qui se comprend seul. */}
              <button
                type="button"
                onClick={() => setOuvert(false)}
                aria-label={labels.title}
                className="grid h-11 w-11 place-items-center text-mist"
              >
                <span aria-hidden="true">✕</span>
              </button>
            </div>
            <ul>
              {rayons.map((r) => (
                <Rayon key={r.slug} rayon={r} labels={labels} niveau={1} />
              ))}
            </ul>
            <Link
              href="/catalogue"
              className="mt-2 block border-t border-line pt-3 text-sm font-semibold text-brand"
            >
              {labels.all}
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
