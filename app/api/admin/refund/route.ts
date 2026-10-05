import { NextResponse } from "next/server";
import { z } from "zod";
import { repartirApresReponse } from "@/lib/webhooks-apres";
import { erreurTraduite } from "@/lib/api-erreur";
import { getAdminUser } from "@/lib/auth";
import { exigerTraceAdmin } from "@/lib/admin-audit";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const input = z.object({ orderId: z.string().uuid() }).strict();

/**
 * POST /api/admin/refund  { orderId }
 * Annule l'écriture comptable d'une commande. Réservé au rôle admin.
 * Le retour des fonds chez l'opérateur est distinct et son justificatif
 * s'enregistre dans la file d'opérations existante.
 * Avant maturité → pending annulé (aucun solde fantôme) ; après → débite le
 * disponible. Idempotent (refund_order renvoie 'already_reversed' au rejeu).
 */
export async function POST(req: Request) {
  const user = await getAdminUser();
  if (!user || user.role !== "admin") {
    return erreurTraduite("api.access.denied", 403);
  }

  let body;
  try {
    body = input.safeParse(await req.json());
  } catch {
    return erreurTraduite("api.json.invalid", 400);
  }
  if (!body.success) {
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
    targetId: body.data.orderId,
  });
  if (!trace) {
    return erreurTraduite("api.audit.unavailable", 503);
  }

  const { data, error } = await admin.rpc("refund_order", {
    p_order_id: body.data.orderId,
  });
  if (error) {
    return erreurTraduite("api.unavailable", 503);
  }
  repartirApresReponse(admin); // webhook `sale.refunded` (0122) — après la réponse
  return NextResponse.json({ ok: true, result: data }, { headers: { "Cache-Control": "no-store" } });
}
