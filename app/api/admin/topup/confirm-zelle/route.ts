import { NextResponse } from "next/server";
import { erreurTraduite } from "@/lib/api-erreur";
import { getCurrentUser } from "@/lib/auth";
import { journaliserActeAdmin } from "@/lib/admin-audit";
import { createAdminClient } from "@/lib/supabase/admin";
import { fulfillTopupOrder } from "@/lib/zabelie-topup/fulfill";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/topup/confirm-zelle  { orderId, reference? }
 * Confirmation ADMINISTRATIVE d'un virement Zelle pour une RECHARGE (V-11),
 * après vérification du relevé (montant exact + mémo). Passe par
 * zabelie_topup_confirm_payment (idempotente, garde-fou USD en base) puis
 * déclenche le fulfillment immédiatement.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return erreurTraduite("api.access.denied", 403);
  }

  let body: { orderId?: string; reference?: string | null };
  try {
    body = await req.json();
  } catch {
    return erreurTraduite("api.json.invalid", 400);
  }
  if (!body.orderId) {
    return erreurTraduite("api.params.invalid", 400);
  }

  const admin = createAdminClient();
  const { data: order } = await admin
    .from("zabelie_topup_orders")
    .select("id, rail, status, expected_usd_cents")
    .eq("id", body.orderId)
    .single();

  if (!order || order.rail !== "zelle") {
    return erreurTraduite("api.order.notfound", 404);
  }
  if (order.expected_usd_cents === null) {
    return erreurTraduite("api.params.invalid", 422);
  }

  const reference =
    typeof body.reference === "string" && body.reference.trim()
      ? body.reference.trim().slice(0, 64)
      : null;

  const { data: confirmed, error } = await admin.rpc(
    "zabelie_topup_confirm_payment",
    {
      p_order_id: body.orderId,
      p_payment_ref: `ZELLE:${reference ?? "releve-bancaire"}`,
      p_raw: { confirmed_by: user.id, admin_reference: reference },
      p_usd_cents: order.expected_usd_cents,
    }
  );
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let fulfillment: { status: string; error?: string } | null = null;
  if (confirmed?.status === "paid") {
    fulfillment = await fulfillTopupOrder(admin, body.orderId);
  }
  await journaliserActeAdmin(admin, {
    actorId: user.id,
    action: "topup.confirm_zelle",
    targetType: "topup_order",
    targetId: body.orderId,
    metadata: { status: confirmed?.status ?? null },
  });
  return NextResponse.json({ ok: true, status: confirmed?.status, fulfillment });
}
