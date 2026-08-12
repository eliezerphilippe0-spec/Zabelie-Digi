import type { MetadataRoute } from "next";
import {
  SITE_TITLE,
  SITE_SHORT_NAME,
  SITE_DESCRIPTION,
  BRAND_INK,
} from "@/lib/brand";

/**
 * MANIFESTE D'APPLICATION WEB — l'icône sur l'écran d'accueil, rien de plus.
 *
 * Ce que ça achète, et pourquoi ça vaut le coup ICI. Sur le terrain visé —
 * Android d'entrée de gamme, données comptées, confiance rare — « installer
 * une application » veut dire un store, un compte, cent mégaoctets et une
 * décision. Ce manifeste met Zabelie à côté de WhatsApp sur l'écran d'accueil
 * pour le coût d'un fichier JSON : plus de barre d'URL à retaper, plus de
 * recherche Google pour retrouver le site, et une icône qui existe même quand
 * le réseau n'existe pas.
 *
 * ⚠️ CE QUE CE FICHIER NE FAIT PAS, et il faut le dire parce que le mot
 * « PWA » laisse croire le contraire : **il n'y a AUCUN cache hors-ligne
 * ici.** Un manifeste sans service worker donne une icône et une fenêtre sans
 * barre d'adresse ; l'application lancée depuis l'écran d'accueil a
 * exactement les mêmes besoins réseau que l'onglet. Le catalogue qui survit à
 * la coupure est un autre chantier, il porte un vrai risque — un service
 * worker survit aux déploiements et peut servir du HTML périmé
 * indéfiniment — et il attend sa spec et son arbitrage
 * (`docs/32-PWA-SERVICE-WORKER.md`).
 *
 * `display: "standalone"` retire la barre d'adresse. C'est le seul effet
 * visible du fichier, et il est réversible : désinstaller l'icône suffit.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    // `id` fige l'identité de l'application pour le navigateur. Sans lui,
    // l'identité dérive de `start_url` — et le jour où `start_url` change,
    // Android considère qu'il s'agit d'une AUTRE application et laisse
    // l'ancienne icône orpheline sur l'écran d'accueil de chaque vendeur.
    id: "/",
    name: SITE_TITLE,
    short_name: SITE_SHORT_NAME,
    description: SITE_DESCRIPTION,
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: BRAND_INK,
    theme_color: BRAND_INK,
    // `lang` déclare la langue du MANIFESTE (ces libellés-ci), pas celle du
    // site : le manifeste est un fichier statique, il ne peut pas suivre le
    // cookie de langue. Les quatre langues restent servies normalement une
    // fois l'application ouverte.
    lang: "fr",
    dir: "ltr",
    categories: ["shopping", "business"],
    icons: [
      // `any` : la tuile telle qu'elle apparaît dans l'en-tête et l'onglet.
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // `maskable` : Android applique SON masque (cercle, goutte, carré selon
      // le constructeur) et rogne jusqu'à 20 % de chaque bord. Sans variante
      // dédiée, le système prend l'icône `any` et coupe les angles de la
      // tuile — ou pire, ajoute lui-même un fond blanc autour. Celle-ci porte
      // un fond pleine surface et le monogramme réduit en zone sûre.
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
