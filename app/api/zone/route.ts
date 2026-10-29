import { NextResponse } from "next/server";
import { erreurTraduite } from "@/lib/api-erreur";
import { getZonesActives } from "@/lib/zones";
import { COOKIE_ZONE, optionsCookieZone, zoneMemorisee } from "@/lib/zone-acheteur";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST   { zoneId } — mémorise la zone de l'acheteur dans le cookie `zabelie_zone`.
 * DELETE            — l'oublie.
 *
 * Aucune écriture en base, aucun compte requis : le cookie est posé sur l'appareil
 * de celui qui clique « Mémoriser ma zone » (docs/77 §11). La valeur est un
 * identifiant de zone OUVERTE, validé ici contre la liste — jamais le texte reçu.
 * Déclaré dans la politique de confidentialité (§8).
 */
function memeOrigine(req: Request): boolean {
  const origin = req.headers.get("origin");
  // Next.js peut normaliser req.url vers localhost derrière son serveur ; l'en-tête
  // Host garde l'autorité réellement adressée par le navigateur (cf. /api/ai/shopping).
  const url = new URL(req.url);
  const attendue = `${url.protocol}//${req.headers.get("host") ?? url.host}`;
  return !origin || origin === attendue;
}

const sansCache = { "Cache-Control": "no-store" };
const production = () => process.env.NODE_ENV === "production";

export async function POST(req: Request) {
  if (!memeOrigine(req)) return erreurTraduite("api.access.denied", 403, { code: "zone_origine" });
  let zoneId: unknown;
  try {
    zoneId = ((await req.json()) as { zoneId?: unknown } | null)?.zoneId;
  } catch {
    return erreurTraduite("api.params.invalid", 400);
  }
  const zone = zoneMemorisee(await getZonesActives(), zoneId);
  if (!zone) return erreurTraduite("api.params.invalid", 422, { code: "zone_inconnue" });
  const reponse = NextResponse.json({ ok: true }, { headers: sansCache });
  reponse.cookies.set(COOKIE_ZONE, zone.id, optionsCookieZone(production()));
  return reponse;
}

export async function DELETE(req: Request) {
  if (!memeOrigine(req)) return erreurTraduite("api.access.denied", 403, { code: "zone_origine" });
  const reponse = NextResponse.json({ ok: true }, { headers: sansCache });
  reponse.cookies.set(COOKIE_ZONE, "", optionsCookieZone(production(), true));
  return reponse;
}
