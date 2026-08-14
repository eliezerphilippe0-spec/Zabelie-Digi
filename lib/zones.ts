import { createClient } from "@/lib/supabase/server";

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
