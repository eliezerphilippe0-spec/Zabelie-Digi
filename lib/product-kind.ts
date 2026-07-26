import type { I18nKey } from "@/lib/i18n";

/**
 * Déclaration CANONIQUE du type de produit — miroir de l'énumération SQL
 * `product_kind` (`0001` puis `0036`). Elle vivait en double dans
 * `lib/sample-data.ts` et `lib/database.types.ts` ; ces deux fichiers la
 * réexportent désormais, il n'y a plus qu'une source.
 *
 * Les littéraux `"fichier"`, `"service"`, `"physical"` sont interdits partout
 * ailleurs (`tests/product-kind-discipline.test.ts`). Interdire la seule
 * comparaison `kind ===` laissait passer `kind !==`, `[...].includes(kind)` ou
 * un test sur une variable renommée : la règle porte donc sur les littéraux
 * eux-mêmes, qui n'ont pas de contournement syntaxique.
 */
export const KIND_FILE = "fichier";
export const KIND_SERVICE = "service";
export const KIND_PHYSICAL = "physical";

export const PRODUCT_KINDS = [KIND_FILE, KIND_SERVICE, KIND_PHYSICAL] as const;

export type ProductKind = (typeof PRODUCT_KINDS)[number];

/**
 * Types créés par le formulaire digital (`/vendre`). Un produit physique a sa
 * propre route et n'entre jamais par là.
 */
export type DigitalKind = typeof KIND_FILE | typeof KIND_SERVICE;

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

/**
 * Contrôle d'exhaustivité — et journalisation du cas où il a été pris en
 * défaut.
 *
 * Le `never` protège à la COMPILATION. Mais les valeurs viennent de la base,
 * et l'énumération Postgres a déjà accepté une valeur que le code ignorait :
 * c'est toute l'histoire de ce bug. Si cette branche est atteinte en
 * production, se taire remplacerait un mensonge bruyant (« Téléchargement
 * immédiat » sur une pièce détachée) par un échec silencieux — pas mieux,
 * juste plus discret.
 *
 * On journalise donc la valeur reçue, le site appelant et la référence
 * produit quand elle est connue. Le rendu, lui, ne promet toujours rien.
 */
function exhaustive(kind: never, site: string, ref?: string): void {
  console.error("[product-kind] valeur inconnue de product_kind", {
    kind,
    site,
    productId: ref ?? null,
  });
}

/**
 * Le produit se livre-t-il par téléchargement ?
 *
 * SEUL `fichier` est vrai. C'est la question qui décide d'afficher un bouton
 * « Télécharger », d'exiger un livrable avant la vente, et de marquer la
 * commande livrée. Un `physical` répondait « oui » par défaut.
 */
export function isDownloadable(kind: ProductKind, ref?: string): boolean {
  switch (kind) {
    case "fichier":
      return true;
    case "service":
    case "physical":
      return false;
    default:
      exhaustive(kind, "isDownloadable", ref);
      // Type inconnu : on ne propose pas un téléchargement qu'on ne peut pas
      // honorer. Un faux négatif se voit et se corrige ; un faux positif
      // envoie l'acheteur sur une erreur après paiement.
      return false;
  }
}

/**
 * Le produit est-il une prestation (mise en relation) ?
 *
 * Existe pour que `lib/product-kind.ts` soit le seul endroit du dépôt où un
 * type de produit se compare — y compris pour les conditions POSITIVES, sans
 * `else`, qui sont sûres à la lecture. Une règle qui tolère des exceptions
 * « évidentes » cesse d'être un contrôle : elle redevient de la vigilance.
 * Garde de test : `tests/product-kind-discipline.test.ts`.
 */
export function isService(kind: ProductKind, ref?: string): boolean {
  switch (kind) {
    case "service":
      return true;
    case "fichier":
    case "physical":
      return false;
    default:
      exhaustive(kind, "isService", ref);
      return false;
  }
}

/** Clé i18n du badge de type (fiche produit). */
export function kindLabelKey(kind: ProductKind, ref?: string): I18nKey | null {
  switch (kind) {
    case "fichier":
      return "product.kind.file";
    case "service":
      return "product.kind.service";
    case "physical":
      return "product.kind.physical";
    default:
      exhaustive(kind, "kindLabelKey", ref);
      return null; // Aucun badge plutôt qu'un badge faux.
  }
}

/** Clé i18n du badge de type (carte de catalogue, libellés courts). */
export function cardKindLabelKey(kind: ProductKind, ref?: string): I18nKey | null {
  switch (kind) {
    case "fichier":
      return "card.kind.file";
    case "service":
      return "card.kind.service";
    case "physical":
      return "card.kind.physical";
    default:
      exhaustive(kind, "cardKindLabelKey", ref);
      return null;
  }
}

/**
 * Clé i18n de la ligne « mode de remise » dans la liste de réassurance.
 * `null` pour un produit physique : la mention de livraison attribuée au
 * vendeur, affichée sous le prix, est la seule chose vraie — on ne double pas
 * d'une seconde formulation.
 */
export function deliveryBulletKey(kind: ProductKind, ref?: string): I18nKey | null {
  switch (kind) {
    case "fichier":
      return "product.file";
    case "service":
      return "product.service";
    case "physical":
      return null;
    default:
      exhaustive(kind, "deliveryBulletKey", ref);
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
  choices: { file: T; service: T; physical: T },
  ref?: string
): T | null {
  switch (kind) {
    case "fichier":
      return choices.file;
    case "service":
      return choices.service;
    case "physical":
      return choices.physical;
    default:
      exhaustive(kind, "pickByKind", ref);
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
  declared?: DeliveryDeclaration,
  ref?: string
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
      exhaustive(kind, "deliveryNoticeKey", ref);
      return null; // Aucune mention plutôt qu'une promesse.
  }
}
