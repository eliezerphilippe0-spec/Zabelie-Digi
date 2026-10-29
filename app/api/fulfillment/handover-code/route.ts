import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/zabelie-rate-limit";
import { codeHttpDuMotif, type ResultatDeclaration } from "@/lib/fulfillment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/fulfillment/handover-code  { orderId }
 *
 * L'ACHETEUR lit son CODE DE REMISE (0163), créé à la première demande. Il le dit
 * au vendeur devant l'objet ; le vendeur le saisit (`/api/fulfillment/handover`).
 *
 * Le code n'est lisible que par l'acheteur : la table n'a aucun droit client, et la
 * fonction vérifie que l'appelant est l'acheteur de la commande. L'identité vient de
 * la SESSION, jamais du corps de requête.
 *
 * Réponse `no-store` : un code à usage unique ne doit se retrouver dans aucun cache.
 * Le code est un secret de session — il n'est jamais journalisé, ici ni ailleurs.
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  }

  let body: { orderId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }
  if (!body.orderId) {
    return NextResponse.json({ error: "orderId requis" }, { status: 400 });
  }

  const admin = createAdminClient();
  if (!(await rateLimit(admin, `handover_code:${user.id}`, 20, 60))) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  const { data, error } = await admin.rpc("zabelie_handover_code_get", {
    p_order_id: body.orderId,
    p_user_id: user.id,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const res = (data ?? {}) as ResultatDeclaration;
  if (!res.ok || typeof res.code !== "string") {
    return NextResponse.json(
      { error: res.reason ?? "refus", status: res.status },
      { status: codeHttpDuMotif(res.reason) }
    );
  }
  return NextResponse.json({ ok: true, code: res.code }, { headers: { "Cache-Control": "no-store" } });
}
