// Zabelie — Backfill best-effort du pays d'un profil (dashboard /admin/geo).
// Server-only : utilise le client service role. Ne JAMAIS exposer au navigateur.
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Code pays (ISO-3166 alpha-2) déduit de la géo-IP de la plateforme.
 * Vercel injecte `x-vercel-ip-country` sur chaque requête (niveau pays, pas de
 * coordonnée). Renvoie null si absent/indéterminé (dev local, réseau privé…).
 */
export function countryFromRequest(req: Request): string | null {
  const c = req.headers.get("x-vercel-ip-country")?.toUpperCase() ?? "";
  // 'XX'/'T1' = inconnu/anonymisé côté Vercel.
  if (!/^[A-Z]{2}$/.test(c) || c === "XX" || c === "T1") return null;
  return c;
}

/**
 * Renseigne profiles.country_code — UNIQUEMENT s'il est vide, jamais
 * d'écrasement d'un choix explicite. Non bloquant (les erreurs sont ignorées :
 * ce backfill ne doit jamais faire échouer une action métier).
 *
 * @param candidate code pays déjà résolu (ex: rail de paiement en priorité,
 *   repli sur `countryFromRequest`). Ignoré si null/invalide.
 */
export async function backfillCountry(
  admin: SupabaseClient,
  userId: string,
  candidate: string | null,
): Promise<void> {
  if (!candidate || !/^[A-Z]{2}$/.test(candidate)) return;
  try {
    await admin
      .from("profiles")
      .update({ country_code: candidate })
      .eq("id", userId)
      .is("country_code", null);
  } catch {
    // best-effort : on avale l'erreur.
  }
}
