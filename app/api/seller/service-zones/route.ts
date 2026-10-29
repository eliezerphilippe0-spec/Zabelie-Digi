import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireActiveAccount } from "@/lib/auth";
import { UUID_RE } from "@/lib/collections";
import { erreurTraduite } from "@/lib/api-erreur";
import { isMissingTable } from "@/lib/product-media";
import { MAX_ZONES_PAR_REQUETE, planifierZones } from "@/lib/zones-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Zones où le vendeur DÉCLARE livrer (docs/77 §8, migration 0158).
 *   GET — mes zones et le plafond.
 *   PUT { zoneIds } — la liste complète voulue ; seule la différence est écrite.
 *
 * ⚠️ SOUS LA SESSION DU VENDEUR, jamais le service : c'est la RLS (0158) qui
 * l'empêche d'écrire au nom d'un autre, et le trigger ZB158 qui refuse une
 * zone fermée ou le dépassement du plafond. Cette route n'applique AUCUNE règle
 * métier de plus — un second garde en TypeScript divergerait du premier. Les
 * refus reviennent avec un CODE (`service_zones_max`, `service_zones_zone`),
 * que l'écran affiche dans la langue du vendeur.
 */
async function session() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function GET() {
  const { supabase, user } = await session();
  if (!user) return erreurTraduite("api.auth.required", 401);
  const refus = await requireActiveAccount(user.id);
  if (refus) return refus;

  const [mes, config] = await Promise.all([
    supabase.from("zabelie_seller_service_zones").select("zone_id").eq("seller_id", user.id),
    supabase.from("zabelie_service_zone_config").select("max_zones").maybeSingle(),
  ]);
  if (mes.error) {
    return erreurTraduite("api.unavailable", 503, {
      code: isMissingTable(mes.error) ? "service_zones_indisponible" : "service_zones_lecture",
    });
  }
  return NextResponse.json({
    ok: true,
    zoneIds: (mes.data ?? []).map((l: { zone_id: string }) => l.zone_id),
    // `null` si la config est illisible : l'écran n'affiche alors aucun plafond.
    max: config.error ? null : ((config.data as { max_zones: number } | null)?.max_zones ?? null),
  });
}

export async function PUT(req: Request) {
  const { supabase, user } = await session();
  if (!user) return erreurTraduite("api.auth.required", 401);
  const refus = await requireActiveAccount(user.id);
  if (refus) return refus;

  let voulues: string[];
  try {
    const body: unknown = await req.json();
    const brut = (body as { zoneIds?: unknown } | null)?.zoneIds;
    if (!Array.isArray(brut) || brut.length > MAX_ZONES_PAR_REQUETE
      || !brut.every((id): id is string => typeof id === "string" && UUID_RE.test(id))) {
      return erreurTraduite("api.params.invalid", 400);
    }
    voulues = brut;
  } catch {
    return erreurTraduite("api.params.invalid", 400);
  }

  const lecture = await supabase.from("zabelie_seller_service_zones").select("zone_id").eq("seller_id", user.id);
  if (lecture.error) {
    return erreurTraduite("api.unavailable", 503, {
      code: isMissingTable(lecture.error) ? "service_zones_indisponible" : "service_zones_lecture",
    });
  }
  const { ajouter, retirer, finales } = planifierZones(
    (lecture.data ?? []).map((l: { zone_id: string }) => l.zone_id),
    voulues
  );

  // Retirer AVANT d'ajouter : remplacer vingt zones par vingt autres ne doit pas
  // buter sur le plafond que les retraits libèrent.
  if (retirer.length) {
    const { error } = await supabase
      .from("zabelie_seller_service_zones")
      .delete()
      .eq("seller_id", user.id)
      .in("zone_id", retirer);
    if (error) return erreurTraduite("api.unavailable", 500, { code: "service_zones_ecriture" });
  }
  if (ajouter.length) {
    const { error } = await supabase
      .from("zabelie_seller_service_zones")
      .insert(ajouter.map((zone_id) => ({ seller_id: user.id, zone_id })));
    if (error) {
      if (error.message.includes("ZB158")) {
        return erreurTraduite("api.params.invalid", 422, {
          code: error.message.includes("plafond") ? "service_zones_max" : "service_zones_zone",
        });
      }
      // Clé étrangère : la zone a disparu entre la lecture et l'écriture.
      if (error.code === "23503") return erreurTraduite("api.params.invalid", 422, { code: "service_zones_zone" });
      // Le message de la base ne part JAMAIS au client.
      return erreurTraduite("api.unavailable", 500, { code: "service_zones_ecriture" });
    }
  }
  return NextResponse.json({ ok: true, zoneIds: finales });
}
