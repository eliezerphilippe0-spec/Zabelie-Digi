/// <reference lib="webworker" />
// ^ Ce fichier s'exécute dans un service worker, pas dans le DOM. Sans cette
//   référence, `ServiceWorkerGlobalScope` n'existe pas pour TypeScript. Un
//   `tsconfig` séparé ferait le même travail au prix d'un second fichier de
//   configuration à garder en phase.
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import {
  CacheFirst,
  ExpirationPlugin,
  NetworkOnly,
  Serwist,
  StaleWhileRevalidate,
} from "serwist";
import {
  CHEMINS_JAMAIS_CACHES,
  PAGE_DESINSTALLATION,
  PAGE_HORS_LIGNE,
} from "@/lib/pwa-routes";

/**
 * LE SERVICE WORKER DE ZABELIE.
 *
 * ─── CE QU'IL ACHÈTE ────────────────────────────────────────────────────────
 * Le terrain, écrit dans `CLAUDE.md` : Android d'entrée de gamme, bande
 * passante faible, coupures fréquentes. Le gain principal n'est pas
 * l'installation sur l'écran d'accueil — c'est de **ne pas retélécharger le
 * même mégaoctet de JavaScript à chaque visite** sur un forfait payé à la
 * donnée, et de ne pas montrer le dinosaure de Chrome quand le réseau tombe.
 *
 * ─── CE QU'IL NE FAIT PAS, ET C'EST DÉLIBÉRÉ ────────────────────────────────
 * **Il ne cache AUCUNE page portant un prix, un stock, une session ou de
 * l'argent.** `lib/pwa-routes.ts` porte la liste, et elle est posée en
 * PREMIER : la première règle qui correspond gagne, donc une règle générique
 * placée devant les viderait de leur sens sans rien casser de visible.
 *
 * La fiche produit (`/produit/…`) est dans cette liste À TITRE PROVISOIRE.
 * L'arbitrage retient l'option B de `docs/32` §2 — cache + bandeau d'âge +
 * revalidation au tap — mais le cache ne doit pas arriver AVANT le bandeau :
 * ce serait l'option C, celle qui « ment en silence ».
 *
 * ─── DISCIPLINE DE VERSION (`docs/32` §3) ───────────────────────────────────
 * `skipWaiting` et `clientsClaim` sont DÉSACTIVÉS. Un service worker qui prend
 * la main immédiatement peut servir un mélange d'ancien et de nouveau bundle
 * sur une page déjà ouverte — le genre d'incident qu'on ne reproduit jamais.
 * La nouvelle version attend que tous les onglets soient fermés.
 */

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}
declare const self: ServiceWorkerGlobalScope;

/**
 * D'ABORD les interdits, construits DEPUIS la liste partagée.
 *
 * Les recopier ici les ferait diverger le jour où quelqu'un modifie la liste
 * sans penser au SW — c'est-à-dire le jour où ça compte.
 */
const reglesSansCache = CHEMINS_JAMAIS_CACHES.map((c) => ({
  matcher: ({ url }: { url: URL }) => new RegExp(c.motif).test(url.pathname),
  handler: new NetworkOnly(),
}));

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  // Voir « discipline de version » ci-dessus. Ne pas activer sans relire §3.
  skipWaiting: false,
  clientsClaim: false,
  navigationPreload: true,
  runtimeCaching: [
    ...reglesSansCache,
    {
      // La page de secours qui DÉSINSTALLE doit rester joignable même si un
      // service worker défectueux est déployé : c'est la seule sortie.
      matcher: ({ url }) => url.pathname.startsWith(PAGE_DESINSTALLATION),
      handler: new NetworkOnly(),
    },
    {
      // Les fichiers de build : immuables, nommés par empreinte. C'est ici que
      // se joue l'économie de données.
      matcher: ({ url }) => url.pathname.startsWith("/_next/static/"),
      handler: new CacheFirst({
        cacheName: "zabelie-static",
        plugins: [new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 })],
      }),
    },
    {
      // Polices : immuables elles aussi, et coûteuses au premier chargement.
      matcher: ({ request }) => request.destination === "font",
      handler: new CacheFirst({
        cacheName: "zabelie-fonts",
        plugins: [new ExpirationPlugin({ maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 })],
      }),
    },
    {
      // Icônes et images STATIQUES du dépôt. Les images de catalogue, elles,
      // vivent sur Supabase Storage et ne sont pas cachées ici : il n'y en a
      // aucune aujourd'hui (V-1), donc une règle les concernant mesurerait
      // zéro et paraîtrait saine — `CLAUDE.md`, « un filet sur un chemin
      // impraticable ».
      matcher: ({ url, request }) =>
        request.destination === "image" && url.origin === self.location.origin,
      handler: new StaleWhileRevalidate({
        cacheName: "zabelie-images-statiques",
        plugins: [new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 30 })],
      }),
    },
  ],
  fallbacks: {
    entries: [
      {
        url: PAGE_HORS_LIGNE,
        matcher: ({ request }) => request.destination === "document",
      },
    ],
  },
});

serwist.addEventListeners();
