import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { erreurTraduite } from "@/lib/api-erreur";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/products";
import { clientIp, rateLimit } from "@/lib/zabelie-rate-limit";
import { parseZoneRemise } from "@/lib/zone-remise";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST { zoneId } — « je cherche un vendeur dans cette zone » (0162, docs/77 §12).
 *
 * Un CLIC explicite de l'acheteur sur une zone qui n'a aucun vendeur : la route
 * incrémente le compteur du jour de cette zone. Ni compte, ni identifiant, ni
 * texte libre n'est enregistré — seulement « une personne de plus a dit chercher
 * ici ». C'est le signal de recrutement, pas un engagement : Zabelie ne promet
 * pas qu'un vendeur arrivera.
 *
 * Route publique PAR CONCEPTION (aucune session) : le garde est le contrôle
 * d'origine (même hôte que la page) ET un débit borné par IP hachée et en
 * global — un script ne peut pas fabriquer une demande qui n'existe pas. La
 * zone doit exister ET être ouverte (la fonction SQL le revérifie).
 */
function memeOrigine(req: Request): boolean {
  const origin = req.headers.get("origin");
  // Next.js peut normaliser req.url vers localhost derrière son serveur ; l'en-tête
  // Host garde l'autorité réellement adressée par le navigateur (cf. /api/zone).
  const url = new URL(req.url);
  const attendue = `${url.protocol}//${req.headers.get("host") ?? url.host}`;
  return !origin || origin === attendue;
}

const sansCache = { "Cache-Control": "no-store" };

export async function POST(req: Request) {
  if (!memeOrigine(req)) return erreurTraduite("api.access.denied", 403, { code: "zone_origine" });
  let zoneId: unknown;
  try {
    zoneId = ((await req.json()) as { zoneId?: unknown } | null)?.zoneId;
  } catch {
    return erreurTraduite("api.params.invalid", 400);
  }
  const zone = parseZoneRemise(zoneId);
  if (!zone) return erreurTraduite("api.params.invalid", 422, { code: "zone_inconnue" });
  if (!isSupabaseConfigured()) return erreurTraduite("api.unavailable", 503);

  const admin = createAdminClient();
  const ipHash = createHash("sha256").update(clientIp(req)).digest("hex");
  if (
    !(await rateLimit(admin, `zone_demande:${ipHash}`, 6, 60)) ||
    !(await rateLimit(admin, `zone_demande_jour:${ipHash}`, 20, 86400)) ||
    !(await rateLimit(admin, "zone_demande_global", 2000, 86400))
  ) {
    return erreurTraduite("api.rate.limited", 429);
  }

  const { data, error } = await admin.rpc("zabelie_record_zone_demand", { p_zone: zone });
  if (error) {
    // Table ou fonction absente (code déployé avant 0162) ou panne : on le dit,
    // on ne prétend pas avoir enregistré.
    console.warn("[zone] demande non enregistrée", error.code);
    return erreurTraduite("api.unavailable", 503);
  }
  if (data !== true) return erreurTraduite("api.params.invalid", 422, { code: "zone_inconnue" });
  return NextResponse.json({ ok: true }, { headers: sansCache });
}
