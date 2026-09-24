import { readSuspension, type Suspension } from "@/lib/account-suspension";
import { erreurTraduite } from "@/lib/api-erreur";
import { readAdminSession } from "@/lib/admin-session";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/products";

export type CurrentUser = {
  id: string;
  email: string | null;
  createdAt?: string;
  displayName: string;
  role: string;
  /** Palier de commission (0005). Sert à l'affichage, jamais au calcul. */
  tier: "standard" | "elite";
};

/**
 * Utilisateur courant (côté serveur), ou null. No-op si Supabase non configuré
 * (mode démo) — ne tente alors aucun accès cookies.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  if (!isSupabaseConfigured()) return null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, role, tier")
    .eq("id", user.id)
    .maybeSingle();

  return {
    id: user.id,
    email: user.email ?? null,
    createdAt: user.created_at,
    displayName: profile?.display_name ?? user.email?.split("@")[0] ?? "Compte",
    role: profile?.role ?? "buyer",
    tier: profile?.tier === "elite" ? "elite" : "standard",
  };
}

/** Throws when the account status cannot be established. */
export async function getSuspension(userId: string): Promise<Suspension | null> {
  return readSuspension(createAdminClient(), userId);
}

/** API guard: preserve the distinction between a suspension and an outage. */
export async function requireActiveAccount(userId: string) {
  try {
    return await getSuspension(userId) ? erreurTraduite("api.suspended", 403, { code: "suspended" }) : null;
  } catch {
    return erreurTraduite("api.unavailable", 503, { code: "account_status_unavailable" });
  }
}

/** Accès humain à l'administration : rôle en base ET session MFA vérifiée. */
export async function getAdminUser(): Promise<CurrentUser | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    return await readAdminSession(await createClient());
  } catch {
    return null;
  }
}
