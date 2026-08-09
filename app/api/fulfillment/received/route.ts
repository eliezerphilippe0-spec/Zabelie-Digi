import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { codeHttpDuMotif, type ResultatDeclaration } from "@/lib/fulfillment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/fulfillment/received  { orderId }
 *
 * L'ACHETEUR confirme avoir reçu. C'est le geste qui débloque l'escrow : la
 * commande passe `delivered`, `gated_on_delivery` retombe, et l'échéance de
 * maturation est fixée.
 *
 * ⚠️ `p_auto` est FIGÉ À FALSE ici, et ce n'est pas un détail : `p_auto = true`
 * fait sauter la vérification d'identité en base (c'est le mode « prononcé par
 * le système », réservé au balayage). Un booléen accepté depuis le corps de
 * requête laisserait n'importe qui prononcer la réception de la commande d'un
 * autre — donc payer un vendeur à la place de l'acheteur. La route ne l'expose
 * pas, et ne doit jamais l'exposer.
 *
 * Le seul autre chemin vers `p_auto = true` est `zabelie_fulfillment_sweep()`,
 * qui n'est appelable ni par `anon` ni par `authenticated`.
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
  const { data, error } = await admin.rpc("zabelie_mark_received", {
    p_order_id: body.orderId,
    p_user_id: user.id,
    p_auto: false, // jamais depuis le corps de requête — voir l'en-tête
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
