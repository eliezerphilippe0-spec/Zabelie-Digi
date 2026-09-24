import type { createAdminClient } from "@/lib/supabase/admin";
import { isMissingFunction } from "@/lib/pg-errors";

/**
 * Âge minimum d'une fiche (0115) — lu en BASE, jamais en dur.
 *
 * Le seuil vit sur `zabelie_categories.age_minimum` (règle dure n°3) et
 * `zabelie_age_minimum()` le remonte le long de l'ascendance du rayon, comme
 * `zabelie_est_rechaj` (0099) : une fiche rangée plus bas n'y échappe pas.
 *
 * Trois issues, et la troisième n'est PAS « aucune restriction » :
 *   - `{ ok: true, age: 0 }`  — fiche sans sous-rayon, rayon sans restriction,
 *     ou fonction absente (0115 non appliquée : aucun rayon ne peut alors être
 *     restreint, et 0116 — qui ouvre le clairin — refuse de passer sans 0115) ;
 *   - `{ ok: true, age: n }`  — l'acheteur doit attester avoir n ans ou plus ;
 *   - `{ ok: false }`         — la base n'a pas répondu. Le checkout REFUSE
 *     (503) : vendre un produit restreint sans avoir pu lire sa restriction
 *     serait le cas que cette colonne existe pour rendre impossible.
 */
export type LectureAge = { ok: true; age: number } | { ok: false };

export async function lireAgeMinimum(
  admin: ReturnType<typeof createAdminClient>,
  productId: string,
  aSousRayon: boolean
): Promise<LectureAge> {
  // Sans sous-rayon, aucune ascendance à remonter : pas d'aller-retour SQL.
  if (!aSousRayon) return { ok: true, age: 0 };

  const { data, error } = await admin.rpc("zabelie_age_minimum", {
    p_product: productId,
  });
  if (error) {
    if (isMissingFunction(error)) return { ok: true, age: 0 };
    console.error("[age-minimum] lecture impossible", {
      productId,
      code: error.code,
    });
    return { ok: false };
  }
  const age = Number(data);
  return { ok: true, age: Number.isInteger(age) && age > 0 ? age : 0 };
}

/**
 * L'attestation n'est valide que si elle vaut EXACTEMENT `true`.
 *
 * Pas de vérité « truthy » : `"false"`, `1`, `"on"` ou un objet ne sont pas
 * une déclaration d'âge. Le client envoie un booléen issu d'une case cochée ;
 * toute autre forme est un appelant qui n'a pas posé la question.
 */
export function attestationAgeValide(input: unknown): boolean {
  return input === true;
}
