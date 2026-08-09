import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { codeHttpDuMotif, type ResultatDeclaration } from "@/lib/fulfillment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/fulfillment/not-received  { orderId, reason? }
 *
 * « M pa resevwa » — l'acheteur signale une non-réception AVANT l'échéance.
 *
 * POURQUOI CETTE ROUTE DOIT EXISTER LE JOUR OÙ LA PREMIÈRE S'OUVRE. Sans elle,
 * la seule protection de l'acheteur serait de ne rien faire — or ne rien faire
 * est EXACTEMENT le geste qui, au terme du délai, prononce la réception et
 * paie le vendeur. Un bouton qui n'existe qu'après l'expiration de l'horloge ne
 * protège personne.
 *
 * Effet : l'escrow RESTE verrouillé et la commande passe `disputed`. Aucun
 * arbitrage automatique — un humain tranche. C'est le checkpoint, pas un défaut
 * de conception : Zabelie n'observe pas la remise et ne peut donc pas décider
 * qui dit vrai.
 *
 * L'identité de l'acheteur vient de la SESSION ; la RPC la re-vérifie.
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  }

  let body: { orderId?: string; reason?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }
  if (!body.orderId) {
    return NextResponse.json({ error: "orderId requis" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("zabelie_report_not_received", {
    p_order_id: body.orderId,
    p_user_id: user.id,
    p_reason: typeof body.reason === "string" ? body.reason.trim().slice(0, 280) : null,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const res = (data ?? {}) as ResultatDeclaration;
  if (!res.ok) {
    return NextResponse.json(
      { error: res.reason ?? "refus", status: res.status },
      { status: codeHttpDuMotif(res.reason) }
    );
  }
  return NextResponse.json({ ok: true, duplicate: res.duplicate === true });
}
