import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Sonde de VIE — « ne ment jamais » (docs/30, P10).
 *
 * Aucune dépendance, aucun appel sortant : si cette route répond 200, le
 * processus tourne ; si elle ne répond pas, il ne tourne pas. C'est tout ce
 * qu'elle dit, et c'est pour ça qu'on peut la croire. L'état de la base est
 * l'affaire de /api/readyz.
 *
 * Publique par conception (PUBLIC_ROUTES) : une sonde derrière un login ne
 * peut pas être appelée par la supervision externe — et elle n'expose RIEN
 * (pas de version, pas de nom d'hôte, pas d'état interne).
 *
 * `force-dynamic` : une sonde mise en cache est une sonde qui ment.
 */
export async function GET() {
  return NextResponse.json(
    { ok: true, time: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } }
  );
}
