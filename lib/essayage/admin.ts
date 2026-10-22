import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Essayage virtuel — l'administration (tâche 5.1) : le compteur du mois, les
 * vendeurs pilotes, et la lecture des actions envoyées par le panneau.
 *
 * Tout passe par le client du RÔLE SERVICE, derrière `getAdminUser()` (rôle
 * admin et double authentification) : les tables de 0150 ne sont accordées
 * qu'à lui.
 */

export type CompteurEssayage = {
  reussis: number;
  enCours: number;
  echecs: number;
  plafond: number;
  quota: number;
  pause: boolean;
  modifie: string;
  /** Places du mois : un échec ne compte pas (la règle de `zabelie_essayage_reserver`). */
  reste: number;
};

export type PiloteEssayage = { vendeurId: string; nom: string; depuis: string };

export type TableauEssayage = { compteur: CompteurEssayage; pilotes: PiloteEssayage[] };

/** Bornes des contraintes de `zabelie_essayage_config` (0150). */
export const PLAFOND_MAX = 1_000_000;
export const QUOTA_MAX = 100;

export type ActionEssayageAdmin =
  | { action: "ajouter"; vendeur: string }
  | { action: "retirer"; vendeur: string }
  | { action: "regler"; plafond: number; quota: number; pause: boolean };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const entier = (v: unknown, max: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= max;

/** Le corps d'un POST du panneau, ou `null` s'il est mal formé. */
export function lireAction(corps: unknown): ActionEssayageAdmin | null {
  if (!corps || typeof corps !== "object" || Array.isArray(corps)) return null;
  const c = corps as Record<string, unknown>;
  if ((c.action === "ajouter" || c.action === "retirer") && typeof c.vendeur === "string" && UUID.test(c.vendeur)) {
    return { action: c.action, vendeur: c.vendeur };
  }
  if (c.action === "regler" && entier(c.plafond, PLAFOND_MAX) && entier(c.quota, QUOTA_MAX) && typeof c.pause === "boolean") {
    return { action: "regler", plafond: c.plafond, quota: c.quota, pause: c.pause };
  }
  return null;
}

/** Le tableau du panneau, ou `null` si la base ne répond pas (0150 pas encore appliquée, par exemple). */
export async function lireTableauEssayage(admin: SupabaseClient): Promise<TableauEssayage | null> {
  const [{ data: lignes, error: e1 }, { data: vendeurs, error: e2 }] = await Promise.all([
    admin.rpc("zabelie_essayage_compteur"),
    admin
      .from("zabelie_essayage_vendeurs")
      .select("seller_id, active_le, vendeur:profiles!zabelie_essayage_vendeurs_seller_id_fkey(display_name)")
      .eq("actif", true)
      .order("active_le", { ascending: true }),
  ]);
  const c = (Array.isArray(lignes) ? lignes[0] : lignes) as
    | { reussis: number; en_cours: number; echecs: number; plafond: number; quota: number; pause: boolean; modifie: string }
    | null
    | undefined;
  if (e1 || e2 || !c) return null;
  const pilotes = ((vendeurs ?? []) as { seller_id: string; active_le: string; vendeur: { display_name: string | null } | { display_name: string | null }[] | null }[]).map((v) => {
    const profil = Array.isArray(v.vendeur) ? v.vendeur[0] : v.vendeur;
    return { vendeurId: v.seller_id, nom: profil?.display_name?.trim() || v.seller_id, depuis: v.active_le };
  });
  return {
    compteur: {
      reussis: c.reussis,
      enCours: c.en_cours,
      echecs: c.echecs,
      plafond: c.plafond,
      quota: c.quota,
      pause: c.pause,
      modifie: c.modifie,
      reste: Math.max(0, c.plafond - c.reussis - c.en_cours),
    },
    pilotes,
  };
}
