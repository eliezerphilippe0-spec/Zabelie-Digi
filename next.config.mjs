import withSerwistInit from "@serwist/next";
import { releaseIdForCommit } from "./lib/deployment-release.mjs";

/** Base policy for assets and API responses. The proxy sets a strict nonce
 * policy for rendered pages; root layout reads request headers (dynamic SSR). */
const securityHeaders = [
  // Anti-encadrement, version moderne. Une CSP réduite à cette seule directive
  // n'affecte aucune ressource : ni script, ni style, ni image.
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },

  // Le même interdit pour les navigateurs qui ignorent `frame-ancestors`. Les
  // navigateurs modernes ignorent CELUI-CI quand la CSP est présente : les
  // deux ne se contredisent pas, ils se relaient.
  { key: "X-Frame-Options", value: "DENY" },

  // Empêche le navigateur de deviner un type MIME. Sans lui, un fichier
  // téléversé par un vendeur et servi avec un type inattendu peut être
  // ré-interprété comme du script.
  { key: "X-Content-Type-Options", value: "nosniff" },

  // Un an, sous-domaines inclus, SANS `preload` (voir plus haut). Vercel sert
  // déjà en HTTPS ; cet en-tête couvre la première requête en clair après une
  // saisie manuelle du domaine.
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  },

  // Le chemin complet d'une fiche ne part pas vers un site tiers. Le domaine
  // suffit à l'analytique ; l'URL, elle, peut porter une recherche.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },

  // Zabelie n'utilise NI géolocalisation, NI caméra, NI micro — vérifié le
  // 2026-08-02 : aucune occurrence de `navigator.geolocation` ni de
  // `getUserMedia` dans `app/`, `components/`, `lib/`. Les refuser
  // explicitement empêche un script tiers introduit un jour de les demander
  // au nom du site.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
];

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Figé dans le bundle au build, pas recalculé au démarrage du serveur.
  env: {
    ZABELIE_RELEASE_ID: releaseIdForCommit(process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA),
  },
  images: {
    // Pas de générique "**" : next/image proxie le fetch côté serveur, un
    // hostname illimité en ferait un SSRF-as-a-service. Scindé au strict
    // besoin (Supabase Storage) — élargir explicitement si un autre hôte
    // d'images de confiance est ajouté.
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co" },
    ],
  },
  async headers() {
    // `/(.*)` couvre tout, routes d'API comprises. Un motif plus étroit
    // laisserait `/connexion` couvert et `/connexion/` non — le genre d'écart
    // qui ne se voit qu'en production.
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

/**
 * PWA — `docs/32`. Le service worker vit dans `app/sw.ts` ; Serwist le compile
 * vers `public/sw.js` et y injecte le manifeste de précache.
 *
 * `disable` en développement : un service worker qui met en cache pendant
 * qu'on code produit des « ça marche chez moi » impossibles à reproduire, et
 * masque justement les rechargements qu'on essaie d'observer.
 *
 * ⚠️ `reloadOnOnline: false`. Par défaut Serwist recharge la page au retour du
 * réseau. Sur une connexion qui va et vient — le terrain visé — ça peut
 * recharger un formulaire à moitié rempli sous les doigts de l'utilisateur.
 */
const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
  reloadOnOnline: false,
});

export default withSerwist(nextConfig);
