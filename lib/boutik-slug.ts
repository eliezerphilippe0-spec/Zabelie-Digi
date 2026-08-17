/**
 * L'ADRESSE PUBLIQUE D'UNE BOUTIQUE — `zabelie.com/boutik/mari-jakmel`.
 *
 * ─── POURQUOI ÇA COMPTE PLUS QUE ÇA N'EN A L'AIR ───────────────────────────
 * L'écran « votre boutique est ouverte » met un lien dans un message
 * WhatsApp. Ce lien valait jusqu'ici
 * `zabelie.com/createur/8f3a1c22-7b90-4d1e-9a55-0e2d7c41b8f6`. Personne ne
 * colle ça dans une conversation, et personne ne le retape sous la dictée —
 * or c'est exactement comme ça qu'une boutique circule ici. Une URL est de
 * l'interface, pas de la plomberie.
 *
 * ─── CE QUE CE MODULE NE FAIT PAS ──────────────────────────────────────────
 * Il ne garantit pas l'unicité : ça se décide en base (index unique) et se
 * résout par un suffixe. Une fonction pure ne peut pas savoir qui existe
 * déjà. Elle FABRIQUE un candidat ; la base tranche.
 */

/**
 * Ce qu'un slug a le droit d'être, redit en base par `0083`.
 *
 * Bornes délibérées : 2 caractères au moins (un slug d'une lettre ne se dicte
 * pas), 40 au plus (au-delà, on retombe dans le problème qu'on répare).
 */
export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const SLUG_MIN = 2;
export const SLUG_MAX = 40;

/**
 * Noms que le slug ne peut pas prendre : ils entreraient en collision avec
 * une route existante ou future, et `/boutik/admin` lu par un humain ne dit
 * pas la même chose que `/admin`.
 */
export const SLUGS_RESERVES = new Set([
  "admin",
  "api",
  "boutik",
  "catalogue",
  "createur",
  "connexion",
  "aide",
  "vendre",
  "panier",
  "rechaj",
  "pro",
  "talents",
  "produit",
  "nouveau",
  "new",
]);

/**
 * Fabrique un slug candidat à partir d'un nom affiché.
 *
 * ⚠️ LES ACCENTS SONT DÉPLIÉS, PAS SUPPRIMÉS. `Jakmèl` doit donner `jakmel`,
 * pas `jakml` : retirer la lettre accentuée au lieu de la déplier mutile le
 * mot, et c'est le genre de défaut qu'on ne voit qu'en kreyòl ou en français
 * — le dépôt en porte déjà la trace (`\b` qui ne connaît pas le kreyòl).
 * `normalize("NFD")` sépare la lettre de son diacritique ; on ne jette que le
 * diacritique.
 *
 * Rend `""` quand il ne reste rien d'utilisable — l'appelant décide alors,
 * plutôt que de recevoir un slug inventé.
 */
export function slugifier(nom: string): string {
  const base = (nom ?? "")
    .normalize("NFD")
    // On ne retire QUE les marques diacritiques (catégorie Unicode Mn).
    .replace(/\p{Mn}/gu, "")
    .toLowerCase()
    // Tout ce qui n'est ni lettre latine ni chiffre devient une césure.
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX)
    // Le découpage à 40 peut laisser un tiret en fin de chaîne.
    .replace(/-+$/g, "");

  return base.length >= SLUG_MIN ? base : "";
}

/** Un slug est-il utilisable comme adresse publique ? */
export function slugValide(slug: string): boolean {
  return (
    slug.length >= SLUG_MIN &&
    slug.length <= SLUG_MAX &&
    SLUG_RE.test(slug) &&
    !SLUGS_RESERVES.has(slug)
  );
}

/**
 * Rend le premier candidat libre : `mari-jakmel`, puis `mari-jakmel-2`, etc.
 *
 * `pris` est l'ensemble des slugs déjà attribués — la base reste l'autorité
 * (index unique), ceci évite seulement l'aller-retour dans le cas courant.
 * Le suffixe est un COMPTEUR, jamais un aléa : deux exécutions sur le même
 * état doivent donner le même résultat, sans quoi une reprise après erreur
 * fabriquerait une seconde adresse pour la même boutique.
 */
export function slugLibre(nom: string, pris: Set<string>): string | null {
  const base = slugifier(nom);
  if (!base) return null;

  if (slugValide(base) && !pris.has(base)) return base;

  for (let n = 2; n <= 999; n++) {
    const suffixe = `-${n}`;
    const tronque = base.slice(0, SLUG_MAX - suffixe.length).replace(/-+$/g, "");
    const candidat = `${tronque}${suffixe}`;
    /* ⚠️ `slugValide` est ici DÉFENSIF, et il faut le dire : la mutation qui
     * le retire ne change aucun comportement observable aujourd'hui. Le garde
     * du dessus écarte déjà les noms réservés, et aucun nom de la liste ne
     * porte de suffixe `-N` — donc aucun candidat suffixé ne peut être
     * réservé, ni malformé (`base` a au moins deux caractères et ne commence
     * pas par un tiret).
     *
     * On le garde quand même : le jour où `SLUGS_RESERVES` gagnera une entrée
     * suffixée, ou où les bornes bougeront, il redeviendra load-bearing. Mais
     * il n'est PAS éprouvé par mutation, contrairement au reste de ce fichier,
     * et un lecteur pressé pourrait le croire prouvé. Il ne l'est pas. */
    if (slugValide(candidat) && !pris.has(candidat)) return candidat;
  }
  return null;
}
