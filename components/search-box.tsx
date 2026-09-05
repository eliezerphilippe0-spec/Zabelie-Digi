"use client";

import { useId, useMemo, useState } from "react";
import Link from "next/link";

/**
 * Recherche avec suggestions de rayons — le seul résultat garanti à
 * catalogue vide.
 *
 * La recherche plein texte reste un GET vers /catalogue (0 JS requis pour
 * soumettre — le formulaire fonctionne sans hydratation). La couche cliente
 * n'AJOUTE que la suggestion : dès 2 caractères, les rayons actifs dont le
 * libellé contient la saisie deviennent des liens directs. À catalogue vide,
 * c'est la différence entre « 0 résultat » et « voici le rayon qui t'attend ».
 *
 * Composant client → libellés en PROPS, jamais `t()` (règle lib/i18n.ts,
 * vérifiée par tests/i18n-client-discipline.test.ts). Les suggestions
 * arrivent déjà À PLAT du serveur : aucune donnée Supabase ne transite ici.
 *
 * Accessibilité : la liste est un simple groupe de liens focusables au Tab,
 * annoncée par `aria-label`, retirée du flux quand vide. Pas de listbox ARIA
 * complète — des liens ordinaires se comprennent mieux qu'un widget imité.
 */
export type SearchSuggestion = { href: string; label: string };

export function SearchBox({
  placeholder,
  submitLabel,
  suggestionsLabel,
  items,
  compact = false,
  variant = "default",
}: {
  placeholder: string;
  submitLabel: string;
  /** Titre du groupe de suggestions, ex. « Kategori yo ». */
  suggestionsLabel: string;
  items: SearchSuggestion[];
  /** Variante en-tête (hauteur réduite). */
  compact?: boolean;
  /**
   * `header` (accueil premium §4.1) : posée sur le chrome sombre de l'en-tête.
   * Le champ est une surface pleine, le bouton n'est plus qu'une loupe — le
   * libellé reste, en `aria-label`, pour le lecteur d'écran.
   */
  variant?: "default" | "header";
}) {
  const [saisie, setSaisie] = useState("");
  const groupeId = useId();

  const suggestions = useMemo(() => {
    const q = saisie.trim().toLowerCase();
    if (q.length < 2) return [];
    // `includes` sur le libellé affiché : les accents comptent tels quels —
    // un acheteur kreyòl tape « elektwonik » et le libellé kreyòl le porte.
    return items.filter((i) => i.label.toLowerCase().includes(q)).slice(0, 6);
  }, [saisie, items]);

  return (
    <div className="relative min-w-0 flex-1">
      <form action="/catalogue" className="flex gap-2">
        <input
          name="q"
          value={saisie}
          onChange={(e) => setSaisie(e.target.value)}
          placeholder={placeholder}
          aria-describedby={suggestions.length > 0 ? groupeId : undefined}
          className={`min-h-11 min-w-0 flex-1 rounded-xl border px-4 text-base outline-none focus:border-accent ${
            variant === "header"
              ? "border-transparent bg-surface text-cloud placeholder:text-mist"
              : "border-line bg-ink/40"
          } ${compact ? "py-2" : "py-3"}`}
        />
        {variant === "header" ? (
          <button
            type="submit"
            aria-label={submitLabel}
            title={submitLabel}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl text-on-chrome transition hover:bg-on-chrome/10 active:scale-[0.97]"
          >
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
              className="h-5 w-5 fill-none stroke-current"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" />
            </svg>
          </button>
        ) : (
        <button
          type="submit"
          /* SECONDAIRE, et c'est une règle : le CHROME ne porte jamais
             l'accent primaire. Cette barre est collante, donc présente sur
             tous les écrans — un bouton orange permanent en ferait l'action
             la plus voyante de chaque page, y compris de celles qui ont la
             leur. Mesuré le 2026-08-17 : sur /catalogue, ce bouton et la
             recherche de la page étaient visibles ENSEMBLE, à 268 px, l'un
             orange et l'autre crème. Deux primaires sur un écran ne
             hiérarchisent rien. */
          className={`min-h-11 rounded-xl border border-line bg-surface/60 px-5 text-sm font-semibold text-cloud transition hover:border-accent/50 ${
            compact ? "py-2" : "py-3"
          }`}
        >
          {submitLabel}
        </button>
        )}
      </form>

      {suggestions.length > 0 && (
        <nav
          id={groupeId}
          aria-label={suggestionsLabel}
          className="absolute inset-x-0 top-full z-40 mt-1 rounded-xl border border-line bg-surface p-2 shadow-xl"
        >
          <p className="px-2 pb-1 text-xs uppercase tracking-wide text-mist">
            {suggestionsLabel}
          </p>
          {suggestions.map((s) => (
            <Link
              key={s.href}
              href={s.href}
              className="block rounded-lg px-2 py-2.5 text-sm text-cloud hover:bg-black/20"
            >
              {s.label}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}
