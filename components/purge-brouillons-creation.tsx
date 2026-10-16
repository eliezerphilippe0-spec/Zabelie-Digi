"use client";
import { useEffect } from "react";
import { purgerBrouillons } from "@/lib/digital-authoring/local-draft-purge";

/**
 * Purge des brouillons locaux du Studio de création (décision D6, docs/70).
 * Monté par l'en-tête du site sur toutes les pages : personne de connecté →
 * tous les brouillons partent ; un compte connecté → seuls les siens restent.
 * La déconnexion (formulaire POST, sans JavaScript) mène à une page qui porte
 * cet en-tête : les brouillons ne survivent pas à la session.
 *
 * Ne rend rien, ne charge rien d'autre que le module de purge (quelques
 * lignes) : il est là pour tous les visiteurs, téléphones modestes compris.
 */
export function PurgeBrouillonsCreation({ garder }: { garder: string | null }) {
  useEffect(() => {
    try {
      purgerBrouillons(window.localStorage, garder);
    } catch {
      /* stockage indisponible : il n'y a rien à purger */
    }
  }, [garder]);
  return null;
}
