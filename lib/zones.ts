import { createClient } from "@/lib/supabase/server";
import type { Lang } from "@/lib/i18n";

/**
 * ZONES — la couche de lecture du filtre catalogue (PR-Z2, `docs/33` §4).
 *
 * La hiérarchie vit en base (`zabelie_zones`, 0069) : 3 niveaux fixes,
 * lecture publique des actives sous RLS. Elle est MINUSCULE (34 lignes au
 * seed, quelques centaines à terme) : on la lit d'un coup et on calcule le
 * sous-arbre en mémoire, plutôt qu'une CTE récursive ou une fonction SQL de
 * plus — « mesurer avant d'optimiser » (`docs/33`), et une fonction de moins
 * à révoquer et croiser.
 *
 * Le sous-arbre est PUR (`sousArbre`) : testable sans base, éprouvé
 * connu-positif ET connu-négatif dans `tests/zones-sous-arbre.test.ts`.
 */

export type ZoneNode = {
  id: string;
  parent_id: string | null;
};

/** Une zone complète, telle que l'UI la consomme (PR-Z3). */
export type Zone = ZoneNode & {
  level: "depatman" | "komin" | "katye";
  slug: string;
  label_kr: string;
  label_fr: string;
  label_en: string | null;
  label_es: string | null;
};

/**
 * Le libellé d'une zone dans la langue demandée. `en`/`es` sont nullables en
 * base (arbitrage Z-D : des toponymes se traduisent rarement) — le repli est
 * TOUJOURS le français, jamais une chaîne vide.
 */
export function libelleZone(z: Pick<Zone, "label_kr" | "label_fr" | "label_en" | "label_es">, lang: Lang): string {
  if (lang === "ht") return z.label_kr;
  if (lang === "en") return z.label_en ?? z.label_fr;
  if (lang === "es") return z.label_es ?? z.label_fr;
  return z.label_fr;
}

/**
 * Le chemin d'une zone vers sa racine : `[depatman, komin, katye?]`, dans
 * l'ordre d'affichage. Zone inconnue de la liste → `[]` (rien à afficher —
 * jamais un chemin inventé). Borné comme `sousArbre` : un cycle termine.
 */
export function cheminZone(zones: Zone[], id: string): Zone[] {
  const parId = new Map(zones.map((z) => [z.id, z]));
  const chemin: Zone[] = [];
  let courant = parId.get(id);
  for (let garde = 0; courant && garde < zones.length; garde++) {
    chemin.unshift(courant);
    if (!courant.parent_id) break;
    const parent = parId.get(courant.parent_id);
    if (!parent || chemin.includes(parent)) break;
    courant = parent;
  }
  return chemin;
}

/** Slug ASCII depuis un toponyme — accents pliés, le reste en tirets. */
export function slugifierZone(nom: string): string {
  return nom
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * La zone et tous ses descendants, calculés sur la liste fournie.
 *
 * Trois niveaux aujourd'hui, mais la boucle est bornée par la TAILLE de la
 * liste, pas par une profondeur supposée : des données corrompues (cycle,
 * parent fantôme) terminent au lieu de boucler — le trigger ZB069 rend le
 * cycle impossible en base, mais un helper pur ne doit pas en dépendre.
 *
 * Une racine inconnue de la liste rend `[racine]` seul : en aval, aucun
 * vendeur ne portera cet id, et le filtre rendra zéro résultat — jamais
 * « pas de filtre », qui afficherait le catalogue entier sous une zone
 * inexistante sans jamais dire que le filtre n'a pas pris (même règle que
 * `productIds` dans `lib/products.ts`).
 */
export function sousArbre(zones: ZoneNode[], racine: string): string[] {
  const dedans = new Set<string>([racine]);
  // Au pire un niveau gagné par passe : `zones.length` passes suffisent
  // toujours, cycle compris (un cycle n'ajoute rien de nouveau et sort).
  for (let passe = 0; passe < zones.length; passe++) {
    let ajout = false;
    for (const z of zones) {
      if (z.parent_id && dedans.has(z.parent_id) && !dedans.has(z.id)) {
        dedans.add(z.id);
        ajout = true;
      }
    }
    if (!ajout) break;
  }
  return [...dedans];
}

/**
 * Les vendeurs dont la zone déclarée tombe dans le sous-arbre de `zoneId`.
 *
 * Deux lectures sous RLS publique (zones actives, profils), zéro droit
 * élevé. Une zone sans vendeur — ou inconnue, ou désactivée (la RLS la
 * masque, donc son sous-arbre se réduit à elle-même) — rend `[]`, et c'est
 * l'appelant qui traduit `[]` en zéro résultat via la sentinelle `ZERO_UUID`.
 *
 * Précondition : Supabase configuré — l'appelant (`lib/products.ts`) ne nous
 * atteint que sur cette branche, la branche démo ayant sa propre règle.
 * (Importer `isSupabaseConfigured` d'ici créerait un cycle products↔zones.)
 */
/**
 * Toutes les zones ACTIVES (la RLS masque les fermées), triées pour l'UI.
 * Même précondition que `getSellerIdsInZone` : Supabase configuré. En cas
 * d'échec, `[]` journalisé — un sélecteur vide plutôt qu'une page tombée.
 */
export async function getZonesActives(): Promise<Zone[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("zabelie_zones")
    .select("id, parent_id, level, slug, label_kr, label_fr, label_en, label_es")
    .order("label_fr");
  if (error || !data) {
    console.warn("[zones] liste illisible, sélecteur vide", error?.message);
    return [];
  }
  return data as Zone[];
}

export async function getSellerIdsInZone(zoneId: string): Promise<string[]> {
  const supabase = await createClient();

  const { data: zones, error: zErr } = await supabase
    .from("zabelie_zones")
    .select("id, parent_id");
  if (zErr || !zones) {
    // Dégradation honnête, même règle que le filtre de stock : une table pas
    // encore migrée ne doit pas tomber la page — mais on JOURNALISE, sinon
    // « zones absentes » et « zone vide » produisent le même zéro.
    console.warn("[zones] lecture impossible, filtre zone sans effet", zErr?.message);
    return [];
  }

  const ids = sousArbre(zones as ZoneNode[], zoneId);
  const { data: sellers, error: sErr } = await supabase
    .from("profiles")
    .select("id")
    .in("zone_id", ids)
    .limit(1000);
  if (sErr || !sellers) {
    console.warn("[zones] vendeurs introuvables pour la zone", sErr?.message);
    return [];
  }
  return sellers.map((s) => s.id);
}
