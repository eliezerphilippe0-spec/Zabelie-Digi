import { NextResponse } from "next/server";
import { erreurTraduite } from "@/lib/api-erreur";
import { getCurrentUser } from "@/lib/auth";
import { journaliserActeAdmin } from "@/lib/admin-audit";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const METHODS = ["moncash", "especes", "virement", "autre"] as const;

/**
 * POST /api/admin/payouts/settle
 *   { payoutId, action: 'paid' | 'rejected', method?, reference?, note?, reason? }
 *
 * Traitement d'une demande de retrait (chantier 0, lot 0.b).
 *  • 'paid'     : l'admin a viré → il inscrit la preuve. Aucun mouvement
 *                 d'argent (le débit a eu lieu à la demande).
 *  • 'rejected' : le solde est restitué par ÉCRITURE COMPENSATOIRE en base.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return erreurTraduite("api.access.denied", 403);
  }

  let body: {
    payoutId?: string;
    action?: string;
    method?: string;
    reference?: string;
    note?: string | null;
    reason?: string;
  };
  try {
    body = await req.json();
  } catch {
    return erreurTraduite("api.json.invalid", 400);
  }

  if (!body.payoutId) {
    return erreurTraduite("api.params.invalid", 400);
  }

  const admin = createAdminClient();

  if (body.action === "rejected") {
    const reason = String(body.reason ?? "").trim().slice(0, 300);
    if (!reason) {
      return erreurTraduite("api.reason.seller", 422);
    }
    const { data, error } = await admin.rpc("zabelie_reject_payout", {
      p_payout_id: body.payoutId,
      p_reason: reason,
      p_recorded_by: user.id,
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    await journaliserActeAdmin(admin, {
      actorId: user.id,
      action: "payout.reject",
      targetType: "payout",
      targetId: body.payoutId,
      reason,
    });
    return NextResponse.json({ ok: true, duplicate: Boolean(data?.duplicate) });
  }

  // Règlement.
  const method = String(body.method ?? "moncash");
  if (!(METHODS as readonly string[]).includes(method)) {
    return erreurTraduite("api.method.unknown", 422);
  }
  const reference = String(body.reference ?? "").trim().slice(0, 120);
  if (!reference) {
    return erreurTraduite("api.receipt.required", 422);
  }

  const { data, error } = await admin.rpc("zabelie_settle_payout", {
    p_payout_id: body.payoutId,
    p_method: method,
    p_reference: reference,
    p_recorded_by: user.id,
    p_note: typeof body.note === "string" ? body.note.trim().slice(0, 500) : null,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 422 });
  }
  await journaliserActeAdmin(admin, {
    actorId: user.id,
    action: "payout.settle",
    targetType: "payout",
    targetId: body.payoutId,
    metadata: { method, duplicate: Boolean(data?.duplicate) },
  });
  return NextResponse.json({ ok: true, duplicate: Boolean(data?.duplicate) });
}
