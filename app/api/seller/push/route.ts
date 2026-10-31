import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireActiveAccount } from "@/lib/auth";
import { erreurTraduite } from "@/lib/api-erreur";
import { adressePushAcceptable, lireClesVapid } from "@/lib/web-push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST   /api/seller/push { endpoint } — cet appareil reçoit les notifications de vente.
 * DELETE /api/seller/push { endpoint } — il ne les reçoit plus.
 *
 * Seule l'ADRESSE de notification est gardée (0169), et seulement si c'est celle
 * d'un service de notification connu (`adressePushAcceptable`) : le serveur
 * appellera cette adresse, une URL quelconque en ferait un relais (SSRF).
 * Un appareil déjà inscrit sous un autre compte passe au compte qui l'inscrit :
 * un téléphone partagé ne reçoit que les ventes de qui est connecté.
 */

/** Au-delà, un compte abonne plus d'appareils qu'un vendeur n'en porte. */
// Non exportée : une route Next n'exporte que ses méthodes et sa configuration.
const APPAREILS_MAX = 10;

const sansCache = { "Cache-Control": "no-store" };

function memeOrigine(req: Request): boolean {
  const origin = req.headers.get("origin");
  const url = new URL(req.url);
  const attendue = `${url.protocol}//${req.headers.get("host") ?? url.host}`;
  return !origin || origin === attendue;
}

async function identifier(req: Request): Promise<{ refus: Response } | { userId: string; endpoint: string }> {
  if (!memeOrigine(req)) return { refus: await erreurTraduite("api.access.denied", 403, { code: "push_origine" }) };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { refus: await erreurTraduite("api.auth.required", 401) };
  const refus = await requireActiveAccount(user.id);
  if (refus) return { refus };
  let endpoint: unknown;
  try {
    endpoint = ((await req.json()) as { endpoint?: unknown } | null)?.endpoint;
  } catch {
    return { refus: await erreurTraduite("api.json.invalid", 400) };
  }
  if (!adressePushAcceptable(endpoint)) return { refus: await erreurTraduite("api.params.invalid", 400, { code: "push_adresse" }) };
  return { userId: user.id, endpoint };
}

export async function POST(req: Request) {
  if (!lireClesVapid()) return erreurTraduite("api.feature.off", 404);
  const r = await identifier(req);
  if ("refus" in r) return r.refus;
  const admin = createAdminClient();
  const { count, error: errCompte } = await admin
    .from("zabelie_push_abonnements")
    .select("id", { count: "exact", head: true })
    .eq("user_id", r.userId)
    .neq("endpoint", r.endpoint);
  if (errCompte) return erreurTraduite("api.unavailable", 503);
  if ((count ?? 0) >= APPAREILS_MAX) return erreurTraduite("api.params.invalid", 409, { code: "push_trop_appareils" });
  const { error } = await admin
    .from("zabelie_push_abonnements")
    .upsert({ user_id: r.userId, endpoint: r.endpoint, echecs: 0 }, { onConflict: "endpoint" });
  if (error) return erreurTraduite("api.unavailable", 503);
  return NextResponse.json({ ok: true }, { headers: sansCache });
}

export async function DELETE(req: Request) {
  const r = await identifier(req);
  if ("refus" in r) return r.refus;
  const { error } = await createAdminClient()
    .from("zabelie_push_abonnements")
    .delete()
    .eq("user_id", r.userId)
    .eq("endpoint", r.endpoint);
  if (error) return erreurTraduite("api.unavailable", 503);
  return NextResponse.json({ ok: true }, { headers: sansCache });
}
