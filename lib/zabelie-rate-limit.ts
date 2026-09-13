import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Limitation de débit (audit sécurité §6) — compteur à fenêtre fixe en
 * Postgres (zabelie_rate_limit, migration 0019), fiable en serverless.
 *
 * Une erreur, un délai dépassé ou une réponse indécidable ferme l’accès.
 * Les journaux ne contiennent ni clé, ni IP, ni message fournisseur.
 */
export async function rateLimit(
  admin: SupabaseClient,
  key: string,
  limit: number,
  windowSeconds = 60
): Promise<boolean> {
  if (!key || !Number.isSafeInteger(limit) || limit < 1 || !Number.isSafeInteger(windowSeconds) || windowSeconds < 1) return false;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);
  try {
    const { data, error } = await admin.rpc("zabelie_rate_limit", {
      p_key: key,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    }).abortSignal(controller.signal);
    if (error || typeof data !== "boolean") {
      console.warn("[rate-limit] verification_unavailable");
      return false;
    }
    return data === true;
  } catch {
    console.warn("[rate-limit] verification_unavailable");
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Première IP de x-forwarded-for (posée par Vercel/le proxy) — clé de débit
 * pour les routes publiques sans utilisateur authentifié.
 */
export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return fwd?.split(",")[0]?.trim() || "unknown";
}
