import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentUser } from "@/lib/auth";

/** Vérifie le jeton auprès d'Auth, le rôle en base et un facteur encore actif.
 * Aucun rôle ni facteur provenant seulement du cookie ne fait autorité.
 * Une panne d'Auth ou de PostgREST ferme l'accès privilégié.
 */
export async function readAdminSession(client: SupabaseClient): Promise<CurrentUser | null> {
  try {
    const session = await client.auth.getSession();
    const token = session.data.session?.access_token;
    if (session.error || !token) return null;
    const identity = await client.auth.getUser(token);
    const user = identity.data.user;
    if (identity.error || !user) return null;
    // getAuthenticatorAssuranceLevel peut encore renvoyer nextLevel=aal2
    // après suppression du dernier facteur : vérifier les facteurs ACTUELS.
    if (!user.factors?.some((factor) => factor.status === "verified")) return null;
    const assurance = await client.auth.mfa.getAuthenticatorAssuranceLevel(token);
    if (assurance.error || assurance.data?.currentLevel !== "aal2") return null;
    const profile = await client.from("profiles")
      .select("display_name, role, tier").eq("id", user.id).maybeSingle();
    if (profile.error || profile.data?.role !== "admin") return null;
    return {
      id: user.id,
      email: user.email ?? null,
      displayName: profile.data.display_name ?? user.email?.split("@")[0] ?? "Compte",
      role: profile.data.role,
      tier: profile.data.tier === "elite" ? "elite" : "standard",
    };
  } catch {
    return null;
  }
}
