import type { ProductKind } from "@/lib/sample-data";
import type { I18nKey } from "@/lib/i18n";

/**
 * Traitement exhaustif du type de produit.
 *
 * Pourquoi ce module existe : le rendu s'écrivait partout
 * `kind === "service" ? … : (branche fichier)`. C'est un `else` qui PROMET —
 * n'importe quelle valeur inconnue héritait du téléchargement immédiat. La
 * base accepte `physical` depuis `0036`, donc une pièce détachée annonçait
 * « Téléchargement immédiat du fichier ».
 *
 * Deux garanties, et elles ne jouent pas au même moment :
 *   - à la COMPILATION, le contrôle `never` sur le défaut fait échouer le
 *     build à la prochaine valeur ajoutée à l'énumération, au lieu de mentir
 *     en silence ;
 *   - à l'EXÉCUTION, le défaut n'affiche **aucune promesse** et ne lève pas :
 *     une exception rendrait la page indisponible, ce qui est pire qu'un
 *     libellé neutre.
 */

/** Contrôle d'exhaustivité — sans effet à l'exécution. */
function exhaustive(_kind: never): void {
  /* Le compilateur seul lit cette ligne. */
}

/**
 * Le produit se livre-t-il par téléchargement ?
 *
 * SEUL `fichier` est vrai. C'est la question qui décide d'afficher un bouton
 * « Télécharger », d'exiger un livrable avant la vente, et de marquer la
 * commande livrée. Un `physical` répondait « oui » par défaut.
 */
export function isDownloadable(kind: ProductKind): boolean {
  switch (kind) {
    case "fichier":
      return true;
    case "service":
    case "physical":
      return false;
    default:
      exhaustive(kind);
      // Type inconnu : on ne propose pas un téléchargement qu'on ne peut pas
      // honorer. Un faux négatif se voit et se corrige ; un faux positif
      // envoie l'acheteur sur une erreur après paiement.
      return false;
  }
}

/** Clé i18n du badge de type (fiche produit). */
export function kindLabelKey(kind: ProductKind): I18nKey | null {
  switch (kind) {
    case "fichier":
      return "product.kind.file";
    case "service":
      return "product.kind.service";
    case "physical":
      return "product.kind.physical";
    default:
      exhaustive(kind);
      return null; // Aucun badge plutôt qu'un badge faux.
  }
}

/** Clé i18n du badge de type (carte de catalogue, libellés courts). */
export function cardKindLabelKey(kind: ProductKind): I18nKey | null {
  switch (kind) {
    case "fichier":
      return "card.kind.file";
    case "service":
      return "card.kind.service";
    case "physical":
      return "card.kind.physical";
    default:
      exhaustive(kind);
      return null;
  }
}

/**
 * Clé i18n de la ligne « mode de remise » dans la liste de réassurance.
 * `null` pour un produit physique : la mention de livraison attribuée au
 * vendeur, affichée sous le prix, est la seule chose vraie — on ne double pas
 * d'une seconde formulation.
 */
export function deliveryBulletKey(kind: ProductKind): I18nKey | null {
  switch (kind) {
    case "fichier":
      return "product.file";
    case "service":
      return "product.service";
    case "physical":
      return null;
    default:
      exhaustive(kind);
      return null;
  }
}

/**
 * Choix d'un libellé déjà traduit, pour les composants qui reçoivent leurs
 * textes en props (règle i18n : `t()` ne s'appelle que côté serveur).
 * Même garantie d'exhaustivité, sans dépendre du dictionnaire.
 */
export function pickByKind<T>(
  kind: ProductKind,
  choices: { file: T; service: T; physical: T }
): T | null {
  switch (kind) {
    case "fichier":
      return choices.file;
    case "service":
      return choices.service;
    case "physical":
      return choices.physical;
    default:
      exhaustive(kind);
      return null;
  }
}

export type DeliveryDeclaration = {
  /** Zone déclarée par le vendeur. Aucune colonne ne la porte encore. */
  zone?: string | null;
  /** Délai déclaré par le vendeur, en jours. */
  days?: number | null;
};

/**
 * Mention de livraison — ce que le VENDEUR déclare, attribué à lui.
 *
 * Zabelie ne livre pas : ni flotte, ni entrepôt, ni contrat transporteur.
 * Toute promesse écrite au nom de la plateforme serait un engagement qu'elle
 * ne peut pas tenir. L'attribution explicite n'est pas une précaution
 * juridique — c'est ce qui rend l'information crédible : un acheteur sait
 * qu'une marketplace ne livre pas un filtre à huile à Jacmel.
 *
 * Renvoie une clé i18n et ses paramètres, jamais du texte : `t()` reste
 * appelé côté serveur (poids du bundle sur 3G).
 */
export function deliveryNoticeKey(
  kind: ProductKind,
  declared?: DeliveryDeclaration
): { key: I18nKey; params?: Record<string, string> } | null {
  switch (kind) {
    case "fichier":
      return { key: "product.delivery" };
    case "service":
      // Le délai déclaré est déjà affiché en badge sur la fiche service.
      return { key: "product.delivery" };
    case "physical": {
      const zone = declared?.zone?.trim();
      const days = declared?.days;
      // Les deux informations, ou aucune : « livraison à [zone] » sans délai,
      // ou « sous 3 jours » sans zone, laisse l'acheteur inventer le reste.
      if (zone && typeof days === "number" && days > 0) {
        return {
          key: "product.delivery.declared",
          params: { zone, days: String(days) },
        };
      }
      return { key: "product.delivery.toAgree" };
    }
    default:
      exhaustive(kind);
      return null; // Aucune mention plutôt qu'une promesse.
  }
}
