import { type Lang } from "@/lib/i18n";

/**
 * Libellés de la frontière d'erreur — et rien d'autre.
 *
 * POURQUOI CE SECOND DICTIONNAIRE EXISTE, alors que le dépôt en a un seul
 * -----------------------------------------------------------------------
 * `app/error.tsx` DOIT être un composant client : Next.js l'exige, c'est une
 * frontière React qui capture une exception de rendu. Or la règle en tête de
 * `lib/i18n.ts` interdit `t()` côté client — appeler `t()` dans un `"use
 * client"` embarquerait les 800 lignes des DEUX langues dans le bundle, contre
 * l'objectif de pages tenables en 3G.
 *
 * Le motif habituel du dépôt — « libellés en props depuis le parent serveur » —
 * ne s'applique pas non plus : `error.tsx` n'a pas de parent qui puisse lui
 * passer quoi que ce soit, Next.js l'instancie avec `{ error, reset }`.
 *
 * D'où ces quatre entrées, isolées et minuscules. Ce n'est PAS une autorisation
 * générale à dupliquer le dictionnaire : c'est la seule surface du produit où
 * aucune des deux voies normales n'est disponible. Toute autre string reste
 * dans `lib/i18n.ts`.
 *
 * La parité FR/HT est verrouillée par `tests/i18n.test.ts`, au même titre que
 * le dictionnaire principal — sans quoi ce fichier serait précisément l'endroit
 * où une clé kreyòl manquerait sans que rien ne le dise.
 */
export type ErrLabels = {
  title: string;
  body: string;
  retry: string;
  home: string;
};

export const ERR: Record<Lang, ErrLabels> = {
  fr: {
    title: "Quelque chose s'est mal passé",
    body: "Une erreur est survenue de notre côté. Vos achats et vos paiements ne sont pas affectés — aucune opération n'a été perdue.",
    retry: "Réessayer",
    home: "Aller à l'accueil",
  },
  ht: {
    title: "Gen yon bagay ki pa mache",
    body: "Gen yon erè bò kote nou. Acha ou yo ak peman ou yo pa touche — anyen pa pèdi.",
    retry: "Eseye ankò",
    home: "Ale nan akèy la",
  },
};

/** Langue lue côté client depuis le cookie. Repli FR, jamais d'exception. */
export function errLabels(lang: Lang): ErrLabels {
  return ERR[lang] ?? ERR.fr;
}
