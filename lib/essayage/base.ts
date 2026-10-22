import type { SupabaseClient } from "@supabase/supabase-js";

import type { GroupeMesure } from "./regles";
import type { BaseEssayage, LigneEssai, VetementFiche } from "./serveur";
import type { NomFournisseur, RaisonEchec } from "./fournisseurs/types";

/**
 * Essayage virtuel — la base réelle (migration 0150), par le client du RÔLE
 * SERVICE (`createAdminClient`). Les fonctions de 0150 ne sont accordées
 * qu'à lui : l'identité de l'acheteur vient de la session vérifiée par la
 * route ou la page, jamais du navigateur.
 *
 * Une erreur de la base lève une `Error` sans détail : l'appelant répond
 * « indisponible », et rien de la base ne part au client.
 */

/** Ce dont la fiche produit a besoin (tâche 4.3). */
export interface FicheEssayage {
  eligible(produit: string, acheteur: string): Promise<boolean>;
  exposer(acheteur: string, produit: string, groupe: GroupeMesure): Promise<void>;
}

const REFUS = new Set(["non_eligible", "pause", "plafond", "quota"]);
const indisponible = () => new Error("essayage : base indisponible");

export function baseEssayage(admin: SupabaseClient): BaseEssayage & FicheEssayage {
  return {
    async lireVetement(produit): Promise<VetementFiche | null> {
      const { data, error } = await admin
        .from("products")
        .select("title, cover_url, sous_rayon:zabelie_categories!products_category_id_fkey(slug)")
        .eq("id", produit)
        .eq("status", "published")
        .maybeSingle();
      if (error) throw indisponible();
      if (!data) return null;
      const ligne = data as { title: string; cover_url: string | null; sous_rayon: { slug: string } | { slug: string }[] | null };
      const sousRayon = (Array.isArray(ligne.sous_rayon) ? ligne.sous_rayon[0] : ligne.sous_rayon)?.slug ?? null;
      return { imageUrl: ligne.cover_url ?? "", titre: ligne.title, sousRayon };
    },

    async reserver(acheteur, produit, fournisseur) {
      const { data, error } = await admin.rpc("zabelie_essayage_reserver", { p_acheteur: acheteur, p_produit: produit, p_fournisseur: fournisseur });
      if (error) throw indisponible();
      const ligne = (Array.isArray(data) ? data[0] : data) as { essai: string | null; refus: string | null } | null;
      if (ligne?.essai) return { essai: ligne.essai };
      if (ligne?.refus && REFUS.has(ligne.refus)) return { refus: ligne.refus as "non_eligible" | "pause" | "plafond" | "quota" };
      throw indisponible();
    },

    async lancer(essai, travail) {
      const { error } = await admin.rpc("zabelie_essayage_lancer", { p_essai: essai, p_travail: travail });
      if (error) throw indisponible();
    },

    async terminer(essai, statut, raison?: RaisonEchec) {
      const { error } = await admin.rpc("zabelie_essayage_terminer", { p_essai: essai, p_statut: statut, p_raison: raison ?? null });
      if (error) throw indisponible();
    },

    async lireEssai(essai, acheteur): Promise<LigneEssai | null> {
      const { data, error } = await admin
        .from("zabelie_essayage_essais")
        .select("id, fournisseur, travail_id, statut, raison, cree_le")
        .eq("id", essai)
        .eq("acheteur_id", acheteur)
        .maybeSingle();
      if (error) throw indisponible();
      if (!data) return null;
      const l = data as { id: string; fournisseur: NomFournisseur; travail_id: string | null; statut: LigneEssai["statut"]; raison: RaisonEchec | null; cree_le: string };
      return { id: l.id, fournisseur: l.fournisseur, travailId: l.travail_id, statut: l.statut, raison: l.raison, creeLe: Date.parse(l.cree_le) };
    },

    async eligible(produit, acheteur) {
      const { data, error } = await admin.rpc("zabelie_essayage_eligible", { p_produit: produit, p_acheteur: acheteur });
      if (error) throw indisponible();
      return data === true;
    },

    async exposer(acheteur, produit, groupe) {
      const { error } = await admin.rpc("zabelie_essayage_exposer", { p_acheteur: acheteur, p_produit: produit, p_groupe: groupe });
      if (error) throw indisponible();
    },
  };
}
