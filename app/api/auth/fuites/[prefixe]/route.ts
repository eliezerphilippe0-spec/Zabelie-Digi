import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { clientIp, rateLimit } from "@/lib/zabelie-rate-limit";
import { PREFIXE_RE } from "@/lib/mot-de-passe-divulgue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HIBP = "https://api.pwnedpasswords.com/range/";

/**
 * GET /api/auth/fuites/<préfixe> — passerelle k-anonyme vers Have I Been Pwned
 * (lib/mot-de-passe-divulgue.ts). Reçoit CINQ caractères hexadécimaux, rend la
 * liste des suffixes connus ; la comparaison se fait dans le navigateur.
 *
 * Rien d'autre ne part chez HIBP : ni cookie, ni en-tête du visiteur, ni son
 * adresse — seulement le préfixe, depuis le serveur. Publique par nature (on
 * la consulte AVANT d'avoir un compte), bornée par adresse hachée. Le préfixe
 * n'est pas une donnée personnelle : la réponse est la même pour tous et se
 * met en cache.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ prefixe: string }> }) {
  const { prefixe } = await params;
  if (!PREFIXE_RE.test(prefixe)) return NextResponse.json({ error: "prefixe_invalide" }, { status: 400 });

  const admin = createAdminClient();
  const ipHash = createHash("sha256").update(clientIp(_req)).digest("hex");
  if (!(await rateLimit(admin, `fuites:${ipHash}`, 20, 60))) {
    return NextResponse.json({ error: "trop_de_demandes" }, { status: 429 });
  }

  const controleur = new AbortController();
  const minuterie = setTimeout(() => controleur.abort(), 3000);
  try {
    const reponse = await fetch(HIBP + prefixe, {
      headers: { "Add-Padding": "true", "User-Agent": "Zabelie-verification-mots-de-passe" },
      cache: "no-store",
      signal: controleur.signal,
    });
    if (!reponse.ok) {
      console.log("[fuites]", JSON.stringify({ at: new Date().toISOString(), issue: "hibp_indisponible", status: reponse.status }));
      return NextResponse.json({ error: "indisponible" }, { status: 503 });
    }
    return new Response(await reponse.text(), {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=86400" },
    });
  } catch {
    console.log("[fuites]", JSON.stringify({ at: new Date().toISOString(), issue: "hibp_injoignable" }));
    return NextResponse.json({ error: "indisponible" }, { status: 503 });
  } finally {
    clearTimeout(minuterie);
  }
}
