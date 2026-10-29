import { NextResponse } from "next/server";
import { echecBase } from "@/lib/api-erreur";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/zabelie-rate-limit";
import { codeHttpDuMotif, type ResultatDeclaration } from "@/lib/fulfillment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/fulfillment/handover  { orderId, code }
 *
 * Le VENDEUR saisit le code de remise que l'acheteur vient de lui donner devant
 * l'objet (0163). Un bon code produit EXACTEMENT la transition « J'ai reçu » —
 * `zabelie_mark_received`, le chemin d'écriture unique qui libère l'escrow — avec
 * l'identité de l'acheteur : aucune règle d'argent nouvelle, plancher anti-fraude
 * conservé (docs/77 §12.3).
 *
 * ⚠️ L'identité du vendeur vient de la SESSION. La fonction revérifie que l'appelant
 * est le vendeur du produit ; un `p_seller_id` fourni par le client ne ferait jamais
 * autorité, et cette route ne l'accepte pas.
 *
 * Deux bornes contre la devinette, qui se complètent : le débit par vendeur
 * (ci-dessous) et le plafond d'essais PAR COMMANDE en base (config, 5), au-delà
 * duquel le code se verrouille. Le code saisi n'est jamais journalisé.
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  }

  let body: { orderId?: string; code?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }
  if (!body.orderId) {
    return NextResponse.json({ error: "orderId requis" }, { status: 400 });
  }
  // Seule la forme est contrôlée ici ; la comparaison et le décompte des essais sont en base.
  const code = typeof body.code === "string" ? body.code.trim().slice(0, 12) : "";

  const admin = createAdminClient();
  if (!(await rateLimit(admin, `handover:${user.id}`, 10, 60))) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  const { data, error } = await admin.rpc("zabelie_handover_confirm", {
    p_order_id: body.orderId,
    p_seller_id: user.id,
    p_code: code,
  });
  if (error) {
    return echecBase("fulfillment/handover", error, "api.write.failed", 500);
  }
  const res = (data ?? {}) as ResultatDeclaration;
  if (!res.ok) {
    return NextResponse.json(
      { error: res.reason ?? "refus", status: res.status, restantes: res.restantes },
      { status: codeHttpDuMotif(res.reason) }
    );
  }
  return NextResponse.json({ ok: true, duplicate: res.duplicate === true });
}
