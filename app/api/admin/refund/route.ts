import { NextResponse } from "next/server";
import { erreurTraduite } from "@/lib/api-erreur";
import { getCurrentUser } from "@/lib/auth";
import { exigerTraceAdmin } from "@/lib/admin-audit";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/refund  { orderId }
 * Rembourse une commande (annule l'escrow). Réservé au rôle admin.
 * Avant maturité → pending annulé (aucun solde fantôme) ; après → débite le
 * disponible. Idempotent (refund_order renvoie 'already_reversed' au rejeu).
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return erreurTraduite("api.access.denied", 403);
  }

  let body: { orderId?: string };
  try {
    body = await req.json();
  } catch {
    return erreurTraduite("api.json.invalid", 400);
  }
  if (!body.orderId) {
    return erreurTraduite("api.params.invalid", 400);
  }

  const admin = createAdminClient();
  /* FAIL-CLOSED (arbitrage porteur 2026-08-10) : la trace d'audit s'écrit
   * AVANT l'acte, et son échec l'interdit — pas d'audit, pas de remboursement.
   * La ligne enregistre l'ORDRE ; le résultat vit dans le ledger. */
  const trace = await exigerTraceAdmin(admin, {
    actorId: user.id,
    action: "order.refund",
    targetType: "order",
    targetId: body.orderId,
  });
  if (!trace) {
    return erreurTraduite("api.audit.unavailable", 503);
  }

  const { data, error } = await admin.rpc("refund_order", {
    p_order_id: body.orderId,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, result: data });
}
