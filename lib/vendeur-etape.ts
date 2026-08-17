/**
 * OÙ EN EST LE VENDEUR — la seule question que l'écran vide doit trancher.
 *
 * ─── POURQUOI CET ÉCRAN EXISTE ─────────────────────────────────────────────
 * Le tableau de bord affichait « Aucune vente pour l'instant. » — honnête, et
 * parfaitement inutile. Un vendeur à zéro vente est le cas NORMAL aujourd'hui
 * (0 commande payée, 1 produit publié) : c'est donc l'écran le plus important
 * du produit, et c'était le moins travaillé. Quatre zéros ne disent pas à
 * quelqu'un s'il a mal fait quelque chose ou s'il doit attendre.
 *
 * La trace qui a commandé ce chantier : trois brouillons du même produit,
 * trois abandons, zéro fichier (2026-08-11). Le vendeur ne savait pas où il
 * s'était arrêté, et rien à l'écran ne le lui disait.
 *
 * ─── POURQUOI UNE FONCTION PURE, ET PAS DES TERNAIRES DANS LE JSX ──────────
 * Une cascade de conditions dans le rendu ne se teste qu'en rendant. Ici la
 * décision est une valeur : les quatre cas s'énumèrent, les frontières
 * s'éprouvent une par une, et le composant n'a plus qu'à choisir un texte.
 * C'est la même raison que `lib/product-kind.ts` — un `switch` exhaustif fait
 * ce qu'un type ne fait pas.
 */

export type EtapeVendeur =
  /** Aucun produit, même pas un brouillon. */
  | "aucun_produit"
  /** Au moins un produit, aucun publié — il s'est arrêté en route. */
  | "brouillon"
  /** Au moins un publié, aucune vente — la boutique existe, personne ne sait. */
  | "publie_sans_vente"
  /** Au moins une vente : le tableau de bord ordinaire reprend la main. */
  | "en_vente";

export type EtatVendeur = {
  /** Nombre total de produits, brouillons compris. */
  produits: number;
  /** Sous-ensemble publié. */
  publies: number;
  /** Ventes cumulées, tous produits confondus. */
  ventes: number;
};

/**
 * L'ORDRE des tests est la règle métier, pas un détail d'écriture.
 *
 * On descend du plus avancé au moins avancé : une vente prime sur tout —
 * y compris sur un produit dépublié depuis. Un vendeur qui a déjà vendu ne
 * doit jamais revoir « publiez votre premier produit », ce serait effacer ce
 * qu'il a fait.
 */
export function etapeVendeur(e: EtatVendeur): EtapeVendeur {
  if (e.ventes > 0) return "en_vente";
  if (e.publies > 0) return "publie_sans_vente";
  if (e.produits > 0) return "brouillon";
  return "aucun_produit";
}

/** Vrai quand l'écran doit GUIDER plutôt que rendre compte. */
export function besoinDeGuidage(etape: EtapeVendeur): boolean {
  return etape !== "en_vente";
}

/**
 * Les trois clés i18n d'une étape qui appelle un guidage.
 *
 * ⚠️ `switch` EXHAUSTIF, et c'est la garantie — pas le type. Ajouter une
 * valeur à `EtapeVendeur` ne casserait aucune compilation si on écrivait un
 * ternaire avec `else` ; ici, le `never` du défaut rougit. Même raison que
 * `lib/product-kind.ts`, et le `grep` n'y suffit pas plus qu'ailleurs.
 *
 * ⚠️ Les clés sont écrites EN TOUTES LETTRES, délibérément. La forme courte
 * `` t(lang, `pas.${prefixe}.titre`) `` compile aussi bien — et elle a été
 * écrite d'abord — mais `tests/i18n-cles-mortes.test.ts` l'aurait couverte
 * par le PRÉFIXE `pas.` : toute clé future commençant par `pas.` serait
 * réputée appelée, morte ou vive. Le mécanisme de préfixe est légitime (il
 * existe pour `` `faq.q${i}` ``) ; il est simplement trop large ici. Neuf
 * littéraux se croisent un par un, un préfixe ne se croise pas du tout.
 */
export function clesEtape(etape: Exclude<EtapeVendeur, "en_vente">): {
  titre: string;
  texte: string;
  cta: string;
} {
  switch (etape) {
    case "aucun_produit":
      return {
        titre: "pas.aucun.titre",
        texte: "pas.aucun.texte",
        cta: "pas.aucun.cta",
      };
    case "brouillon":
      return {
        titre: "pas.brouillon.titre",
        texte: "pas.brouillon.texte",
        cta: "pas.brouillon.cta",
      };
    case "publie_sans_vente":
      return {
        titre: "pas.publie.titre",
        texte: "pas.publie.texte",
        cta: "pas.publie.cta",
      };
    default: {
      const jamais: never = etape;
      throw new Error(`étape vendeur non couverte : ${String(jamais)}`);
    }
  }
}
