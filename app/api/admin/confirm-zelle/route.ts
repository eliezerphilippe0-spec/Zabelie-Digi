import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { exigerTraceAdmin } from "@/lib/admin-audit";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/confirm-zelle  { orderId, reference? }
 * Confirmation ADMINISTRATIVE d'un virement Zelle, après vérification du relevé
 * bancaire. Passe par le MÊME confirm_payment idempotent que MonCash/Stripe :
 * p_usd_cents = expected_usd_cents figé au checkout (le garde-fou en base
 * vérifie l'égalité — l'admin confirme un virement du montant EXACT, sinon il
 * rembourse). Rejeu sans double crédit.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  let body: { orderId?: string; reference?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }
  if (!body.orderId) {
    return NextResponse.json({ error: "orderId requis" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: payment } = await admin
    .from("payments")
    .select("rail, status, expected_usd_cents")
    .eq("order_id", body.orderId)
    .single();

  if (!payment || payment.rail !== "zelle") {
    return NextResponse.json({ error: "Paiement Zelle introuvable" }, { status: 404 });
  }
  if (payment.expected_usd_cents === null) {
    return NextResponse.json(
      { error: "Montant USD attendu absent — confirmation impossible" },
      { status: 422 }
    );
  }

  const reference =
    typeof body.reference === "string" && body.reference.trim()
      ? body.reference.trim().slice(0, 64)
      : null;

  /* FAIL-CLOSED (arbitrage porteur 2026-08-10) : même règle que refund —
   * pas de trace, pas de confirmation. L'issue (confirmed/duplicate) vit dans
   * payments ; la ligne d'audit dit qui a ordonné la confirmation. */
  const trace = await exigerTraceAdmin(admin, {
    actorId: user.id,
    action: "payment.confirm_zelle",
    targetType: "order",
    targetId: body.orderId,
  });
  if (!trace) {
    return NextResponse.json(
      { error: "Journal d'audit indisponible — confirmation refusée (fail-closed)" },
      { status: 503 }
    );
  }

  const { data, error } = await admin.rpc("confirm_payment", {
    p_idempotency_key: body.orderId, // = order.id
    p_provider_ref: `ZELLE:${reference ?? "releve-bancaire"}`,
    p_raw: {
      confirmed_by: user.id,
      admin_reference: reference,
      confirmed_via: "admin-zelle",
    },
    p_usd_cents: payment.expected_usd_cents,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (data?.status === "confirmed") {
    // Suivi de remise d'abord (attendu : l'escrow doit être gelé), e-mails
    // ensuite. Rail semi-manuel, mais la règle ne change pas avec le rail.
    const { ouvrirSuiviLivraison } = await import("@/lib/fulfillment");
    await ouvrirSuiviLivraison(admin, body.orderId, "admin/confirm-zelle");
    const { notifyOrderPaid } = await import("@/lib/zabelie-notify");
    notifyOrderPaid(admin, body.orderId).catch(() => undefined);
  }
  return NextResponse.json({ ok: true, status: data?.status });
}
