import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireActiveAccount } from "@/lib/auth";
import { erreurTraduite } from "@/lib/api-erreur";
import { isMissingTable } from "@/lib/product-media";
import { lireZonesVoulues, planifierConditions, type ConditionsZone } from "@/lib/zones-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Zones où le vendeur DÉCLARE livrer (docs/77 §8, migration 0158).
 *   GET — mes zones (avec frais, délai et pause annoncés, 0164) et le plafond.
 *   PUT { zones: [{ zoneId, feeHtg?, delayHours?, pause? }] } — la liste complète voulue ; seule la
 *       différence est écrite. Le format d'avant `{ zoneIds }` reste accepté, conditions INTACTES.
 *
 * ⚠️ Les frais annoncés ne sont PAS ajoutés au paiement : une information affichée (docs/77 §12.4).
 * La date d'une pause est calculée ICI, jamais reçue du navigateur.
 *
 * ⚠️ SOUS LA SESSION DU VENDEUR, jamais le service : c'est la RLS (0158) qui
 * l'empêche d'écrire au nom d'un autre, et le trigger ZB158 qui refuse une
 * zone fermée ou le dépassement du plafond, ZB164 qui borne la pause. Cette route
 * n'applique AUCUNE règle métier de plus — un second garde en TypeScript divergerait
 * du premier : elle ne contrôle que la FORME (`lireZonesVoulues`). Les refus reviennent
 * avec un CODE (`service_zones_max`, `service_zones_zone`, `service_zones_pause`,
 * `service_zones_valeur`), que l'écran affiche dans la langue du vendeur.
 */
/** Les colonnes de 0164 ; une base en retard de migration les rejoue sans elles (repli ci-dessous). */
const COLONNES = "zone_id, fee_htg, delay_hours, paused_until";
const COLONNES_AVANT_0164 = "zone_id";

type Ligne = { zone_id: string; fee_htg?: number | null; delay_hours?: number | null; paused_until?: string | null };
const enConditions = (l: Ligne): ConditionsZone => ({ feeHtg: l.fee_htg ?? null, delayHours: l.delay_hours ?? null, pausedUntil: l.paused_until ?? null });

async function lireMesZones(supabase: Awaited<ReturnType<typeof createClient>>, vendeurId: string) {
  const r = await supabase.from("zabelie_seller_service_zones").select(COLONNES).eq("seller_id", vendeurId);
  // Colonne absente (0164 pas encore appliquée) : on relit sans, les conditions restent vides.
  if (r.error && r.error.code === "42703") {
    return supabase.from("zabelie_seller_service_zones").select(COLONNES_AVANT_0164).eq("seller_id", vendeurId);
  }
  return r;
}

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
    lireMesZones(supabase, user.id),
    supabase.from("zabelie_service_zone_config").select("max_zones").maybeSingle(),
  ]);
  if (mes.error) {
    return erreurTraduite("api.unavailable", 503, {
      code: isMissingTable(mes.error) ? "service_zones_indisponible" : "service_zones_lecture",
    });
  }
  const lignes = (mes.data ?? []) as unknown as Ligne[];
  return NextResponse.json({
    ok: true,
    zoneIds: lignes.map((l) => l.zone_id),
    zones: lignes.map((l) => ({ zoneId: l.zone_id, ...enConditions(l) })),
    // `null` si la config est illisible : l'écran n'affiche alors aucun plafond.
    max: config.error ? null : ((config.data as { max_zones: number } | null)?.max_zones ?? null),
  });
}

export async function PUT(req: Request) {
  const { supabase, user } = await session();
  if (!user) return erreurTraduite("api.auth.required", 401);
  const refus = await requireActiveAccount(user.id);
  if (refus) return refus;

  let voulues: ReturnType<typeof lireZonesVoulues>;
  try {
    voulues = lireZonesVoulues(await req.json());
  } catch {
    return erreurTraduite("api.params.invalid", 400);
  }
  if (!voulues) return erreurTraduite("api.params.invalid", 400);

  const lecture = await lireMesZones(supabase, user.id);
  if (lecture.error) {
    return erreurTraduite("api.unavailable", 503, {
      code: isMissingTable(lecture.error) ? "service_zones_indisponible" : "service_zones_lecture",
    });
  }
  const actuelles = new Map(((lecture.data ?? []) as unknown as Ligne[]).map((l) => [l.zone_id, enConditions(l)]));
  const { ajouter, modifier, retirer, finales } = planifierConditions(actuelles, voulues, new Date());

  /** Le refus de la base, traduit en CODE ; son message ne part JAMAIS au client. */
  const refusEcriture = (error: { code?: string; message: string }) => {
    if (error.message.includes("ZB158")) {
      return erreurTraduite("api.params.invalid", 422, {
        code: error.message.includes("plafond") ? "service_zones_max" : "service_zones_zone",
      });
    }
    if (error.message.includes("ZB164")) return erreurTraduite("api.params.invalid", 422, { code: "service_zones_pause" });
    // Contrainte de borne (frais, délai) : la forme a été contrôlée, la base a le dernier mot.
    if (error.code === "23514") return erreurTraduite("api.params.invalid", 422, { code: "service_zones_valeur" });
    // Clé étrangère : la zone a disparu entre la lecture et l'écriture.
    if (error.code === "23503") return erreurTraduite("api.params.invalid", 422, { code: "service_zones_zone" });
    return erreurTraduite("api.unavailable", 500, { code: "service_zones_ecriture" });
  };

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
  // Les conditions d'une zone qui reste : une écriture par ligne changée, sous la session (RLS 0164 :
  // seules les trois colonnes de conditions sont modifiables, zone_id et seller_id sont immuables).
  for (const l of modifier) {
    const { error } = await supabase
      .from("zabelie_seller_service_zones")
      .update({ fee_htg: l.fee_htg, delay_hours: l.delay_hours, paused_until: l.paused_until })
      .eq("seller_id", user.id)
      .eq("zone_id", l.zone_id);
    if (error) return refusEcriture(error);
  }
  if (ajouter.length) {
    const { error } = await supabase
      .from("zabelie_seller_service_zones")
      // `seller_id` APRÈS la propagation : la session l'emporte sur toute valeur de la ligne.
      .insert(ajouter.map((l) => ({ ...l, seller_id: user.id })));
    if (error) return refusEcriture(error);
  }
  return NextResponse.json({ ok: true, zoneIds: finales });
}
