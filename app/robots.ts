import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site-url";

/**
 * ⚠️ `siteUrl()` ET PAS `process.env.NEXT_PUBLIC_SITE_URL` — mesuré le
 * 2026-08-28.
 *
 * Ce fichier lisait la variable en direct, avec un repli `http://localhost:3000`.
 * `app/layout.tsx` passe, lui, par `siteUrl()`, qui retombe sur l'URL injectée
 * par Vercel avant de retomber sur localhost. Les deux pouvaient donc désigner
 * des domaines DIFFÉRENTS sur un même déploiement : les canoniques annonçaient
 * une origine, `robots.txt` en annonçait une autre pour le sitemap.
 *
 * ─── DISALLOW ET NOINDEX SE DÉFONT L'UN L'AUTRE ────────────────────────────
 * C'est le piège de ce fichier, et il est contre-intuitif : **une URL
 * `disallow` n'est jamais lue, donc son `noindex` n'est jamais vu.** Google
 * peut alors indexer l'adresse nue, sans contenu, sur la seule foi d'un lien
 * entrant — exactement ce qu'on voulait empêcher.
 *
 * D'où le partage ci-dessous, qui n'est pas une préférence :
 *   • `disallow` pour ce qui n'a AUCUN intérêt d'entrée et rien à cacher —
 *     du budget de crawl économisé, rien de plus ;
 *   • `noindex` (dans la page) pour ce qui doit rester HORS de l'index même
 *     si quelqu'un en partage le lien. `/facture/[token]` est de ceux-là, et
 *     c'est pourquoi il n'apparaît PAS dans cette liste.
 */
export default function robots(): MetadataRoute.Robots {
  const base = siteUrl();
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/tableau-de-bord",
        "/mes-achats",
        // Même raison que /mes-achats : page privée, propre à un compte.
        "/mes-ventes",
        "/paiement/",
        // Ajoutés le 2026-08-28. Aucune de ces adresses n'est une porte
        // d'entrée : un visiteur anonyme n'y trouve qu'une invitation à se
        // connecter. Rien à cacher ici — c'est du budget de crawl, pas de la
        // confidentialité (voir l'en-tête : ce qui doit être caché ne se
        // met PAS ici).
        "/panier",
        "/messages",
        "/connexion",
      ],
    },
    sitemap: `${base}/sitemap.xml`,
  };
}
