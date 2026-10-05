import type { Lang } from "@/lib/i18n";

/**
 * LA LANGUE DANS L'URL — `/ht/…` et `/fr/…` (docs/47 §3).
 *
 * Instruction porteur du 2026-10-05 : « Corrige les URLs /ht/ et /fr/ pour
 * l'indexation ». Un crawler n'envoie aucun cookie : tant que la langue ne
 * vivait que dans `zabelie_lang`, tout le site était indexé en français et
 * AUCUNE page kreyòl n'existait pour Google.
 *
 * Le montage, et pourquoi il ne déplace aucune page : le proxy RÉÉCRIT
 * `/ht/produit/x` vers `/produit/x` en posant `x-zabelie-guide-lang: ht`,
 * que `getLang()` lit avant le cookie — le même mécanisme que les pages
 * éditoriales (`lib/editorial-routing.ts`) et les guides. Les 31 routes
 * restent où elles sont.
 *
 * Deux langues indexées seulement, `ht` et `fr` (recommandation de docs/47,
 * reprise mot pour mot par le porteur). `en` et `es` restent en cookie et
 * sont `noindex` : quatre versions d'un catalogue presque vide, c'est du
 * contenu mince ×4. `fr` reste la langue par défaut (décision du 2026-09-02),
 * d'où `x-default` → `/fr/…`.
 *
 * Module PUR, sans `next/headers` : le proxy (Edge) l'importe.
 */
export const LANGS_INDEXEES = ["ht", "fr"] as const;
export type LangIndexee = (typeof LANGS_INDEXEES)[number];

export function estLangIndexee(lang: string | null | undefined): lang is LangIndexee {
  return lang === "ht" || lang === "fr";
}

/**
 * Les pages publiques qui ont une adresse par langue. Une LISTE FERMÉE, pas
 * « tout sauf » : un espace privé (`/tableau-de-bord`, `/mes-achats`) ou une
 * route d'API n'a rien à faire sous `/ht/`, et un ajout ici est un geste.
 * Les pages éditoriales (`/aide`, `/a-propos`, `/recharges`) et les guides
 * ont déjà leurs propres routes localisées et n'y figurent pas.
 */
const CHEMINS: RegExp[] = [
  /^\/$/,
  /^\/catalogue$/,
  /^\/categories$/,
  /^\/vendre$/,
  /^\/vendre\/physique$/,
  /^\/produits-interdits$/,
  /^\/developpeurs$/,
  /^\/conditions$/,
  /^\/confidentialite$/,
  /^\/produit\/[^/]+$/,
  /^\/boutik\/[^/]+$/,
];

export function estCheminLocalisable(base: string): boolean {
  return CHEMINS.some((re) => re.test(base));
}

/** `/ht/produit/x` → `{ lang: "ht", base: "/produit/x" }` ; `/fr` → base `/`. `null` sinon. */
export function langueDeLUrl(chemin: string): { lang: LangIndexee; base: string } | null {
  const m = /^\/(ht|fr)(\/.*)?$/.exec(chemin);
  if (!m) return null;
  const base = (m[2] ?? "/").replace(/(.)\/$/, "$1");
  return estCheminLocalisable(base) ? { lang: m[1] as LangIndexee, base } : null;
}

/** `("/produit/x", "ht")` → `/ht/produit/x` ; `("/", "fr")` → `/fr`. La requête suit le chemin. */
export function cheminLocalise(base: string, lang: LangIndexee): string {
  const [chemin, requete] = base.split(/\?(.*)/s, 2);
  return `/${lang}${chemin === "/" ? "" : chemin}${requete ? `?${requete}` : ""}`;
}

/**
 * Canonique et hreflang d'une page localisable, pour la langue SERVIE.
 *
 * Servie en `ht` ou en `fr` (par l'URL ou par le cookie) : sa canonique est
 * l'adresse préfixée de cette langue. Servie en `en`/`es` (cookie seul) : la
 * page n'est pas indexée (`robots`), et sa canonique renvoie au français, la
 * langue par défaut.
 */
export function metaLangue(base: string, lang: Lang) {
  const servie: LangIndexee = estLangIndexee(lang) ? lang : "fr";
  return {
    alternates: {
      canonical: cheminLocalise(base, servie),
      languages: {
        ht: cheminLocalise(base, "ht"),
        fr: cheminLocalise(base, "fr"),
        "x-default": cheminLocalise(base, "fr"),
      },
    },
    robots: estLangIndexee(lang) ? undefined : { index: false, follow: true },
  };
}

/**
 * Pour le sélecteur de langue : où aller depuis une page `/ht/…` ou `/fr/…`.
 * Vers `ht`/`fr` : l'autre préfixe. Vers `en`/`es` : l'adresse sans préfixe
 * (servie par le cookie) — sinon la langue de l'URL l'emporterait sur le
 * choix et le clic ne changerait rien. `null` hors d'une adresse localisée.
 */
export function cheminPourLangue(chemin: string, lang: Lang): string | null {
  const localise = langueDeLUrl(chemin);
  if (!localise) return null;
  return estLangIndexee(lang) ? cheminLocalise(localise.base, lang) : localise.base;
}
