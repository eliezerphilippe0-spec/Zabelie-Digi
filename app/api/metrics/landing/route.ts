import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit, clientIp } from "@/lib/zabelie-rate-limit";
import { LANDING_EVENTS, logLanding, type LandingEvent } from "@/lib/metrics";

/**
 * Réception des événements que le serveur ne peut pas voir lui-même — le clic
 * sortant vers WhatsApp, typiquement (la navigation quitte le site, aucune
 * page à nous ne le verra). Fire-and-forget côté client (`sendBeacon`).
 *
 * Zéro PII, zéro stockage : validation stricte de l'événement (liste fermée),
 * une ligne de journal, 204 dans tous les cas. Tout champ inconnu est IGNORÉ
 * — un client ne peut pas faire écrire ce qu'il veut dans le journal.
 *
 * Route publique par nature (l'acheteur n'est pas connecté) : le garde est la
 * borne de débit par IP — sans elle, un script transformerait le journal de
 * mesure en bruit et les chiffres seraient inutilisables le jour où on les
 * lit. L'IP sert de CLÉ de fenêtre (table `zabelie_rate_limit`, TTL court) et
 * n'est PAS journalisée avec l'événement.
 */
export async function POST(req: Request) {
  // Fail-open cohérent avec lib/zabelie-rate-limit : sans base (démo, panne),
  // la mesure passe — elle ne bloque jamais rien, elle n'est jamais bloquante.
  try {
    const admin = createAdminClient();
    const ok = await rateLimit(admin, `metrics:${clientIp(req)}`, 30, 60);
    if (!ok) return new NextResponse(null, { status: 204 }); // silencieux : rien à gagner à le dire
  } catch {
    // Pas de client admin (env absente) : on journalise quand même.
  }

  let event = "";
  try {
    const body = (await req.json()) as { event?: string };
    event = body.event ?? "";
  } catch {
    // Beacon mal formé : ignoré. Perdre un clic de mesure ne justifie rien.
  }
  if (LANDING_EVENTS.has(event)) {
    logLanding(event as LandingEvent);
  }
  return new NextResponse(null, { status: 204 });
}
