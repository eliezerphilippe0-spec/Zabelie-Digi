import { NextResponse } from "next/server";
import { erreurTraduite } from "@/lib/api-erreur";
import { getCurrentUser } from "@/lib/auth";
import { journaliserActeAdmin } from "@/lib/admin-audit";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/topup/refunds  { orderId, reference }
 * CHECKPOINT HUMAIN (contrainte BRH n°4) : cet endpoint n'exécute AUCUN
 * mouvement d'argent. L'admin rembourse d'abord manuellement via le moyen de
 * paiement D'ORIGINE (MonCash ou Zelle) — jamais un solde interne — puis
 * enregistre ici la référence du remboursement : transition
 * refund_pending → refunded, tracée au ledger append-only.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return erreurTraduite("api.access.denied", 403);
  }

  let body: { orderId?: string; reference?: string };
  try {
    body = await req.json();
  } catch {
    return erreurTraduite("api.json.invalid", 400);
  }
  if (!body.orderId) {
    return erreurTraduite("api.params.invalid", 400);
  }
  const reference = (body.reference ?? "").trim().slice(0, 64);
  if (!reference) {
    return erreurTraduite("api.receipt.required", 422);
  }

  const admin = createAdminClient();
  const { data: order } = await admin
    .from("zabelie_topup_orders")
    .select("id, status, rail")
    .eq("id", body.orderId)
    .single();
  if (!order) {
    return erreurTraduite("api.order.notfound", 404);
  }
  if (order.status !== "refund_pending") {
    return NextResponse.json(
      { error: `Statut '${order.status}' — seul refund_pending est remboursable.` },
      { status: 409 }
    );
  }

  const { data, error } = await admin.rpc("zabelie_topup_transition", {
    p_order_id: body.orderId,
    p_to: "refunded",
    p_detail: {
      refunded_by: user.id,
      refund_reference: reference,
      refund_rail: order.rail, // moyen de paiement d'origine uniquement
    },
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  await journaliserActeAdmin(admin, {
    actorId: user.id,
    action: "topup.refund",
    targetType: "topup_order",
    targetId: body.orderId,
    metadata: { status: data?.status ?? null },
  });
  return NextResponse.json({ ok: true, status: data?.status });
}
