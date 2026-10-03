import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { repartir } from "@/lib/webhooks";

/**
 * Envoie les webhooks en attente APRÈS la réponse HTTP (`after`).
 *
 * Appelé juste après une confirmation de paiement ou un remboursement : le
 * trigger de `0122` a déjà enfilé l'événement dans la même transaction ; ceci
 * n'en accélère que la LIVRAISON. Ne lève jamais et ne retarde jamais la
 * réponse : hors contexte de requête, l'envoi est laissé au cron quotidien.
 */
export function repartirApresReponse(admin: SupabaseClient): void {
  try {
    after(async () => { await repartir(admin, { lots: 1 }); });
  } catch {
    // Hors requête (script, test) : le cron `/api/webhooks/dispatch` reprendra.
  }
}
