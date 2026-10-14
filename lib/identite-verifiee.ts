import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/products";

/**
 * BADGE « IDENTITÉ VÉRIFIÉE » — 0138 (décision porteur du 2026-10-14, audit
 * `docs/69`, lot 2).
 *
 * Parmi les vendeurs demandés, ceux dont le dossier KYC est approuvé, par
 * `zabelie_identites_verifiees`. La fonction ne répond que pour des MARCHANDS
 * non suspendus : elle n'apprend rien sur un acheteur.
 *
 * ⚠️ FAIL-CLOSED. Sur toute erreur (fonction absente tant que 0138 n'est pas
 * appliquée, incident), l'ensemble est VIDE : aucun badge plutôt qu'un badge
 * inventé. Et c'est journalisé, sinon « personne n'est vérifié » et « la
 * lecture a échoué » afficheraient la même page.
 */
export async function identitesVerifiees(ids: (string | null | undefined)[]): Promise<Set<string>> {
  const uniques = [...new Set(ids.filter((id): id is string => Boolean(id)))].slice(0, 100);
  if (!isSupabaseConfigured() || uniques.length === 0) return new Set();
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("zabelie_identites_verifiees", { p_ids: uniques });
    if (error || !Array.isArray(data)) {
      console.warn("[identite] badge indisponible", error?.message ?? "réponse vide");
      return new Set();
    }
    return new Set((data as unknown[]).filter((x): x is string => typeof x === "string"));
  } catch {
    console.warn("[identite] badge indisponible");
    return new Set();
  }
}
