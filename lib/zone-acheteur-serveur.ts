import { cookies } from "next/headers";
import type { Zone } from "@/lib/zones";
import { COOKIE_ZONE, zoneMemorisee } from "@/lib/zone-acheteur";

/**
 * La zone mémorisée de l'acheteur, lue dans le cookie `zabelie_zone`. `zones` est
 * la liste des zones OUVERTES : un cookie qui désigne une zone fermée ou inconnue
 * rend `null`. Ne lit jamais la base — l'appelant a déjà la liste.
 */
export async function lireZoneAcheteur(zones: readonly Zone[]): Promise<Zone | null> {
  return zoneMemorisee(zones, (await cookies()).get(COOKIE_ZONE)?.value);
}
