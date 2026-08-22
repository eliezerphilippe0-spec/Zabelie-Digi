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
 *
 * Déclarés en TABLEAU et non en union écrite à la main : le garde ci-dessous
 * en dérive, donc ajouter un type digital ne peut pas laisser le garde en
 * arrière. Une union et une liste maintenues séparément divergent toujours.
 */
export const DIGITAL_KINDS = [KIND_FILE, KIND_SERVICE] as const;
export type DigitalKind = (typeof DIGITAL_KINDS)[number];

/**
 * Le `kind` reçu d'un CLIENT est-il un type digital valide ?
 *
 * POURQUOI CE GARDE EXISTE — un type qui ment à la frontière du réseau.
 * `app/api/products/route.ts` déclarait `kind?: DigitalKind` sur un corps
 * issu de `req.json()`. `DigitalKind` est un type TypeScript : EFFACÉ à la
 * compilation. Rien ne validait donc `kind` à l'exécution — seule sa présence
 * était testée (`!kind`). Or `physical` est une valeur d'énumération valide
 * en base depuis `0036` : un POST forgé avec `kind: "physical"` créait une
 * fiche PHYSIQUE par la route DIGITALE, hors de
 * `app/api/products/physical/route.ts` et de ses validations (catégorie
 * active, poids, stock, variantes, acceptation de politique).
 *
 * Mitigation qui existait déjà, et qui explique pourquoi ce n'était pas une
 * urgence : toute fiche naît en BROUILLON et attend une publication humaine.
 * Le contrôle existait, il était humain — et un humain ne dit pas POURQUOI
 * une fiche est mal formée.
 *
 * C'est la même classe que le reste de ce module : ce qui n'échoue pas à la
 * compilation doit échouer à l'exécution, sinon rien n'échoue.
 */
export function isDigitalKind(value: unknown): value is DigitalKind {
  return (DIGITAL_KINDS as readonly unknown[]).includes(value);
}

/**
 * Le garde qui manquait : une valeur venue de la BASE est-elle un type connu ?
 *
 * ⚠️ Né le 2026-08-22 en servant l'API v1. `products.kind` arrive de PostgREST
 * en `string` — le type TypeScript qu'on lui donne est une promesse, pas une
 * vérification. Sans ce garde, la seule façon de le passer aux prédicats du
 * module était un `as ProductKind`, c'est-à-dire exactement le contournement
 * que ce module existe pour rendre inutile.
 *
 * L'asymétrie avec `isDigitalKind` mérite d'être dite : celui-là garde une
 * ENTRÉE (ce qu'un client POSTe), celui-ci garde une SORTIE de base (ce que
 * Postgres rend). Les deux frontières sont réelles, et une valeur
 * d'énumération ajoutée en SQL sans l'être ici franchit la seconde sans bruit.
 */
export function isProductKind(value: unknown): value is ProductKind {
  return (PRODUCT_KINDS as readonly unknown[]).includes(value);
}

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

/**
 * Types de produits exposés par la recherche de l'API v1.
 *
 * Décision porteur du 2026-08-01 : `search_products` ne renvoie **pas** les
 * prestations. Les services relèvent de Zabelie Business, pas de la place de
 * marché — les mélanger dans une API destinée à devenir un tool d'agent
 * ferait proposer une prestation là où l'acheteur cherche un objet.
 *
 * ⚠️ Écart assumé avec le site : le catalogue web, lui, affiche les trois
 * types. L'API v1 est donc plus étroite que `/catalogue`, délibérément, et
 * `docs/24-API-V1.md` le dit à l'endroit où quelqu'un s'en étonnera.
 *
 * Vit ICI et pas dans les schémas Zod parce que la règle du dépôt interdit
 * tout littéral de type de produit hors de ce module — un tableau
 * `["fichier", "physical"]` écrit ailleurs serait exactement le contournement
 * que `tests/product-kind-discipline.test.ts` existe pour attraper.
 */
export function isSearchableByApiV1(kind: ProductKind, ref?: string): boolean {
  switch (kind) {
    case "fichier":
    case "physical":
      return true;
    case "service":
      return false;
    default:
      exhaustive(kind, "isSearchableByApiV1", ref);
      // Un type inconnu n'entre pas dans une sortie d'API : on préfère
      // l'omettre que l'exposer sans savoir ce qu'il est.
      return false;
  }
}

/**
 * Ce type SUIT-IL un stock chiffré ?
 *
 * Né le 2026-08-22, en servant `check_inventory` de l'API v1. La distinction
 * que ce prédicat porte n'est pas cosmétique — le schéma de sortie en dépend :
 *
 *   • `totalAvailable: null` → « ce produit ne suit pas de stock ». Un fichier
 *     ne s'épuise pas ; un service non plus, il se refuse.
 *   • `totalAvailable: 0`    → « suivi, et il n'en reste aucun ».
 *
 * Confondre les deux ferait annoncer « épuisé » un fichier téléchargeable à
 * l'infini — c'est-à-dire refuser une vente qui pouvait avoir lieu.
 *
 * Le stock chiffré vit dans `zabelie_stock`, adossé aux VARIANTES
 * (`0036`), et seul le physique en a.
 */
export function isTrackedStockKind(kind: ProductKind, ref?: string): boolean {
  switch (kind) {
    case "physical":
      return true;
    case "fichier":
    case "service":
      return false;
    default:
      exhaustive(kind, "isTrackedStockKind", ref);
      // Un type inconnu : on ne PRÉTEND pas connaître son stock. `false` mène
      // à `totalAvailable: null`, c'est-à-dire « on ne sait pas » — jamais à
      // un zéro qui se lirait « épuisé ».
      return false;
  }
}

/** Les types réellement interrogeables par l'API v1, dérivés — jamais écrits. */
export const API_V1_SEARCHABLE_KINDS = PRODUCT_KINDS.filter((k) =>
  isSearchableByApiV1(k, "API_V1_SEARCHABLE_KINDS")
) as readonly ProductKind[];
