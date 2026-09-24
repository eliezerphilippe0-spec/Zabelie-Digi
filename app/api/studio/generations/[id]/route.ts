import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { studioProvider } from "@/lib/studio-server";
import { erreurTraduite } from "@/lib/api-erreur";
import { EVENTS_TABLE, GENERATIONS_TABLE, actionLecture, etatCourant, etatVisible } from "@/lib/creative/studio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COLONNES = "etat,provider_ref,image_url,detail,created_at";

/**
 * GET /api/studio/generations/[id] — état d'une génération du vendeur connecté.
 * Chaque lecture d'une génération en cours interroge Higgsfield UNE fois et
 * inscrit la transition constatée. Aucune relance de soumission, jamais.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const provider = studioProvider();
  if (!provider) return erreurTraduite("api.feature.off", 404, { code: "studio_eteint" });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return erreurTraduite("api.auth.required", 401);

  const { id } = await params;
  if (!UUID.test(id)) return erreurTraduite("api.studio.notfound", 404);

  const admin = createAdminClient();
  const { data: gen, error } = await admin.from(GENERATIONS_TABLE).select("id,created_at")
    .eq("id", id).eq("seller_id", user.id).maybeSingle();
  if (error) return erreurTraduite("api.unavailable", 503);
  if (!gen) return erreurTraduite("api.studio.notfound", 404);

  const lire = async () => {
    const { data, error: e } = await admin.from(EVENTS_TABLE).select(COLONNES).eq("generation_id", id).order("id");
    return e ? null : etatCourant(data ?? []);
  };
  const etat = await lire();
  if (!etat) return erreurTraduite("api.unavailable", 503);

  const action = actionLecture(etat, gen.created_at, Date.now());
  if (action === "rendre") return NextResponse.json({ id, ...etatVisible(etat) });

  let evenement: Record<string, string> | null = null;
  if (typeof action === "object") {
    evenement = { generation_id: id, etat: "failed", detail: action.echouer };
  } else if (etat.state === "generating") {
    let s;
    try { s = await provider.status(etat.providerRef); } catch { s = { state: "generating" as const }; }
    if (s.state === "completed") evenement = { generation_id: id, etat: "completed", image_url: s.imageUrl };
    else if (s.state === "failed") evenement = { generation_id: id, etat: "failed", detail: s.error };
  }
  if (!evenement) return NextResponse.json({ id, ...etatVisible(etat) });

  // Deux lectures simultanées peuvent constater la même fin : la base n'en
  // garde qu'une (index unique), et l'on relit ce qu'elle a retenu.
  const { error: journal } = await admin.from(EVENTS_TABLE).insert(evenement);
  if (journal && journal.code !== "23505") return erreurTraduite("api.unavailable", 503);
  const relu = await lire();
  if (!relu) return erreurTraduite("api.unavailable", 503);
  return NextResponse.json({ id, ...etatVisible(relu) });
}

