import type { Metadata } from "next";
import { OG_IMAGE_ALT } from "@/lib/brand";
import { t, type I18nKey, type Lang } from "@/lib/i18n";
import { metaLangue } from "@/lib/langue-url";

/**
 * MÉTADONNÉES DES PAGES PUBLIQUES — titre, description, canonique, langues et
 * aperçu de partage, dans la langue servie.
 *
 * Deux défauts mesurés en production le 2026-10-14, que ce module corrige :
 *   1. `/ht`, `/ht/vendre` ou `/ht/produits-interdits` annonçaient un titre et
 *      une description EN FRANÇAIS (une constante `META` par page) : Google
 *      montrait du français à une recherche en kreyòl.
 *   2. Dans Next.js, une page qui déclare son propre `openGraph` REMPLACE celui
 *      de la racine, image comprise : le catalogue et les guides partageaient
 *      sans image, et les pages sans `openGraph` reprenaient toutes le titre
 *      générique de l'accueil sur WhatsApp et Facebook.
 */

/** L'image de `app/opengraph-image.tsx`, à redonner par chaque page. */
export const IMAGE_PARTAGE = { url: "/opengraph-image", width: 1200, height: 630, alt: OG_IMAGE_ALT } as const;

const LOCALE_OG: Record<Lang, string> = { ht: "ht_HT", fr: "fr_FR", en: "en_US", es: "es_ES" };

/** Aperçu de partage (Open Graph + Twitter) d'une page, image comprise. */
export function partage(
  lang: Lang,
  titre: string,
  description: string,
  url: string,
  type: "website" | "article" = "website"
): Pick<Metadata, "openGraph" | "twitter"> {
  return {
    openGraph: { title: titre, description, url, type, siteName: "Zabelie", locale: LOCALE_OG[lang], images: [IMAGE_PARTAGE] },
    twitter: { card: "summary_large_image", title: titre, description, images: [IMAGE_PARTAGE.url] },
  };
}

/** Clés de titre et de description, une paire par page à adresse par langue. */
export const META_PAGES = {
  accueil: ["meta.accueil.title", "meta.accueil.description"],
  vendre: ["meta.vendre.title", "meta.vendre.description"],
  vendrePhysique: ["meta.vendrePhysique.title", "meta.vendrePhysique.description"],
  interdits: ["meta.interdits.title", "meta.interdits.description"],
  conditions: ["meta.conditions.title", "meta.conditions.description"],
  confidentialite: ["meta.confidentialite.title", "meta.confidentialite.description"],
  developpeurs: ["meta.developpeurs.title", "meta.developpeurs.description"],
} as const satisfies Record<string, readonly [I18nKey, I18nKey]>;

/** Métadonnées complètes d'une page à adresse par langue (`/ht/…`, `/fr/…`). */
export function metaPage(base: string, lang: Lang, page: keyof typeof META_PAGES): Metadata {
  const [cleTitre, cleDescription] = META_PAGES[page];
  const titre = t(lang, cleTitre);
  const description = t(lang, cleDescription);
  const langue = metaLangue(base, lang);
  return { title: titre, description, ...langue, ...partage(lang, titre, description, langue.alternates.canonical) };
}
