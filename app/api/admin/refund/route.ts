import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { journaliserActeAdmin } from "@/lib/admin-audit";
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
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
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
  const { data, error } = await admin.rpc("refund_order", {
    p_order_id: body.orderId,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  await journaliserActeAdmin(admin, {
    actorId: user.id,
    action: "order.refund",
    targetType: "order",
    targetId: body.orderId,
  });
  return NextResponse.json({ ok: true, result: data });
}
