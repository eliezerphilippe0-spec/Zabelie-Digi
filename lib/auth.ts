import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/products";

export type CurrentUser = {
  id: string;
  email: string | null;
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
    displayName: profile?.display_name ?? user.email?.split("@")[0] ?? "Compte",
    role: profile?.role ?? "buyer",
    tier: profile?.tier === "elite" ? "elite" : "standard",
  };
}

export type Suspension = { suspendedAt: string; reason: string | null };

/**
 * Suspension de modération du compte, ou null si actif. Lecture via service
 * role : suspended_* est invisible aux clients (grants colonne, 0017). En cas
 * d'erreur (clé absente…), on renvoie null — la suspension reste garantie par
 * le ban auth + le masquage catalogue côté base.
 */
export async function getSuspension(userId: string): Promise<Suspension | null> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("profiles")
      .select("suspended_at, suspended_reason")
      .eq("id", userId)
      .maybeSingle();
    if (!data?.suspended_at) return null;
    return { suspendedAt: data.suspended_at, reason: data.suspended_reason };
  } catch {
    return null;
  }
}
