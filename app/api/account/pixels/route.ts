import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireActiveAccount } from "@/lib/auth";
import { getLang } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";
import { idValide, type Regie } from "@/lib/pixels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CHAMPS: Record<Regie, "meta_pixel_id" | "google_tag_id" | "tiktok_pixel_id"> = {
  meta: "meta_pixel_id", google: "google_tag_id", tiktok: "tiktok_pixel_id",
};

/**
 * PUT /api/account/pixels — enregistre les pixels du vendeur connecté.
 * Champ vide = pixel retiré. Champ non vide hors format = 422, rien n'est
 * écrit (la base le refuserait de toute façon : contraintes de `0123`).
 * Écriture par la SESSION : la RLS limite à la ligne du vendeur.
 */
export async function PUT(req: Request) {
  const lang = await getLang();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: t(lang, "api.auth.required") }, { status: 401 });
  const bloque = await requireActiveAccount(user.id);
  if (bloque) return bloque;

  let corps: Partial<Record<Regie, unknown>> = {};
  try { corps = await req.json(); } catch { /* corps absent : tout vide */ }
  const ligne: Record<string, string | null> = { seller_id: user.id };
  for (const regie of Object.keys(CHAMPS) as Regie[]) {
    const brut = typeof corps[regie] === "string" ? (corps[regie] as string).trim() : "";
    if (!brut) { ligne[CHAMPS[regie]] = null; continue; }
    const id = idValide(regie, brut);
    if (!id) return NextResponse.json({ error: t(lang, "pixels.err.format"), code: "invalid_format", field: regie }, { status: 422 });
    ligne[CHAMPS[regie]] = id;
  }
  const { error } = await supabase
    .from("zabelie_seller_pixels")
    .upsert({ ...ligne, updated_at: new Date().toISOString() }, { onConflict: "seller_id" });
  if (error) {
    console.error("[pixels] enregistrement refusé", error.code, error.message);
    return NextResponse.json({ error: t(lang, "api.unavailable"), code: "unavailable" }, { status: 503 });
  }
  return NextResponse.json({ ok: true, meta: ligne.meta_pixel_id, google: ligne.google_tag_id, tiktok: ligne.tiktok_pixel_id });
}
