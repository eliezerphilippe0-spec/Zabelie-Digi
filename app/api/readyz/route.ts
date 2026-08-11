import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Sonde de DISPONIBILITÉ — la base répond-elle ? (docs/30, P10)
 *
 * `select 1` (la requête la plus légère qui traverse vraiment PostgREST)
 * sous un délai court : au-delà de 1 500 ms, une marketplace visée 3G est
 * de fait indisponible même si la requête aurait fini par aboutir. Échec ou
 * délai → 503, pour qu'une supervision externe alerte.
 *
 * `latencyMs` est renseignée AUSSI en cas d'échec : « la base refuse
 * instantanément » et « la base ne répond pas en 1 500 ms » sont deux pannes
 * différentes, et la sonde doit permettre de les distinguer.
 *
 * Nuance serverless, assumée : sur Vercel cette route teste UNE instance
 * éphémère + le chemin vers Supabase — pas « le serveur ». Sa valeur est la
 * supervision externe pointée dessus (OPS_TODO), pas l'introspection.
 *
 * Publique par conception (PUBLIC_ROUTES) : elle n'expose qu'un booléen et
 * une latence — jamais de message d'erreur interne, de version ni de schéma.
 */
const DELAI_MS = 1500;

export async function GET() {
  const t0 = Date.now();
  let pret = false;
  try {
    /* Client ANON, pas service role (revue porteur 2026-08-10) : la sonde
     * n'a besoin d'aucun privilège — zabelie_categories est la taxonomie
     * publique, lisible sous RLS par tout visiteur. Bonus réel : on teste le
     * CHEMIN DES ACHETEURS (PostgREST + RLS anon), pas un chemin privilégié
     * qui pourrait marcher quand le leur est cassé. */
    const anon = await createClient();
    const sonde = anon.from("zabelie_categories").select("id", { count: "exact", head: true }).limit(1);
    const coupure = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("delai")), DELAI_MS)
    );
    const { error } = (await Promise.race([sonde, coupure])) as { error: unknown };
    pret = !error;
  } catch {
    pret = false;
  }
  const latencyMs = Date.now() - t0;
  return NextResponse.json(
    { ok: pret, latencyMs },
    { status: pret ? 200 : 503, headers: { "Cache-Control": "no-store" } }
  );
}
