/**
 * LES CHEMINS QUI NE SONT JAMAIS SERVIS DEPUIS UN CACHE.
 *
 * > Un service worker qui sert une page de paiement périmée n'est pas un bug
 * > d'affichage, c'est un incident financier. (`docs/32` §2)
 *
 * Cette liste est une DONNÉE, pas un commentaire : `app/sw.ts` la consomme
 * pour construire ses règles, et `tests/pwa-service-worker.test.ts` la croise
 * avec le service worker. Une liste que le SW n'utiliserait pas serait une
 * déclaration d'intention — exactement ce que ce dépôt appelle un instrument
 * non éprouvé.
 *
 * ⚠️ L'ORDRE COMPTE. Ces règles sont posées AVANT toute autre : la première
 * qui correspond gagne. Une règle de cache générique placée devant les
 * viderait de leur sens sans rien casser de visible.
 */

export type CheminSansCache = {
  /** Source d'expression régulière, testée contre `url.pathname`. */
  motif: string;
  /** Pourquoi ce chemin ne peut pas vieillir. Lu par le test, pas décoratif. */
  raison: string;
};

export const CHEMINS_JAMAIS_CACHES: CheminSansCache[] = [
  {
    motif: "^/api/",
    raison:
      "Toutes les routes serveur, sans exception ni liste d'exclusion — un montant, un lien de passerelle ou une URL signée périmés engagent de l'argent ou rendent un 403 incompréhensible.",
  },
  {
    motif: "^/panier",
    raison: "État propre à la session : faux dès qu'il vieillit.",
  },
  {
    motif: "^/mes-achats",
    raison: "État propre à la session : faux dès qu'il vieillit.",
  },
  {
    motif: "^/mes-ventes",
    raison: "État propre à la session, et porte des montants.",
  },
  {
    motif: "^/admin",
    raison: "État propre à la session, plus le risque de montrer l'état d'un autre.",
  },
  {
    motif: "^/tableau-de-bord",
    raison: "État propre à la session, plus le risque de montrer l'état d'un autre.",
  },
  {
    motif: "^/connexion",
    raison: "Une page d'authentification périmée bloque l'accès sans le dire.",
  },
  {
    motif: "^/auth/",
    raison: "Une page d'authentification périmée bloque l'accès sans le dire.",
  },
  {
    motif: "^/reinitialiser-mot-de-passe",
    raison: "Une page d'authentification périmée bloque l'accès sans le dire.",
  },
  {
    motif: "^/inscription",
    raison: "Une page d'authentification périmée bloque l'accès sans le dire.",
  },
  {
    // ⚠️ CAS DISCUTABLE, tranché POUR L'INSTANT côté sûr — voir `docs/32` §2.
    // L'arbitrage porteur du 2026-08-13 retient l'option B : la fiche sera
    // cachée AVEC un bandeau d'âge et une revalidation au tap. Tant que ce
    // bandeau n'existe pas, cacher la fiche serait l'option C — « elle ment en
    // silence ». La fiche reste donc hors cache jusqu'à ce que les deux
    // arrivent DANS LE MÊME GESTE.
    motif: "^/produit/",
    raison:
      "Provisoire : la fiche porte le prix et la disponibilité. Cachée sans bandeau d'âge, elle afficherait un prix d'hier sans le dire. Sortira de cette liste en même temps qu'arriveront le bandeau et la revalidation au tap (docs/32 §2, option B).",
  },
];

/** Vrai si ce chemin ne doit jamais venir d'un cache. */
export function jamaisCache(pathname: string): boolean {
  return CHEMINS_JAMAIS_CACHES.some((c) => new RegExp(c.motif).test(pathname));
}

/** Page servie à la place d'une navigation impossible hors réseau. */
export const PAGE_HORS_LIGNE = "/hors-ligne";

/** Page de secours qui désinstalle le SW — joignable SANS lui (`docs/32` §3). */
export const PAGE_DESINSTALLATION = "/sw-desinstaller";
