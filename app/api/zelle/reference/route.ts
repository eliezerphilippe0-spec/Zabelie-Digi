import { NextResponse } from "next/server";
import { echecBase } from "@/lib/api-erreur";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/zelle/reference  { orderId, reference? }
 * L'acheteur signale avoir envoyé son virement Zelle (référence optionnelle).
 * DÉCLARATIF UNIQUEMENT : aucun statut ne change ici — la confirmation reste
 * administrative (/api/admin/confirm-zelle → confirm_payment).
 */
export async function POST(req: Request) {
  let body: { orderId?: string; reference?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }
  if (!body.orderId) {
    return NextResponse.json({ error: "orderId requis" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: payment } = await admin
    .from("payments")
    .select("id, rail, status, raw, orders!inner(buyer_id)")
    .eq("order_id", body.orderId)
    .single();

  const rawOrder = payment?.orders as unknown;
  const order = (Array.isArray(rawOrder) ? rawOrder[0] : rawOrder) as
    | { buyer_id: string }
    | null;
  if (!payment || payment.rail !== "zelle" || order?.buyer_id !== user.id) {
    return NextResponse.json({ error: "Paiement introuvable" }, { status: 404 });
  }
  if (payment.status !== "pending") {
    return NextResponse.json({ error: "Paiement déjà traité" }, { status: 409 });
  }

  const reference =
    typeof body.reference === "string" ? body.reference.slice(0, 64) : null;
  const raw = (payment.raw ?? {}) as Record<string, unknown>;
  const { error } = await admin
    .from("payments")
    .update({
      raw: { ...raw, buyer_ref: reference ?? "", buyer_ref_at: new Date().toISOString() },
    })
    .eq("id", payment.id);

  if (error) {
    return echecBase("zelle/reference", error, "api.write.failed", 500);
  }
  return NextResponse.json({ ok: true });
}
