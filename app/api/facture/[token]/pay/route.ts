import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createPayment } from "@/lib/moncash";
import { rateLimit } from "@/lib/zabelie-rate-limit";
import { randomBytes } from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/facture/[token]/pay
 * Portail client PUBLIC (sans login) : initie un paiement MonCash pour le
 * RESTE DÛ de la facture. Le montant est calculé SERVEUR (total − déjà payé),
 * jamais fourni par le client. La confirmation réelle se fait serveur-à-serveur
 * dans /api/moncash/return (idempotente), pas ici.
 *
 * Référence MonCash = `biz:<invoiceId>:<nonce>` : identifie la facture et reste
 * unique par tentative (permet plusieurs versements + reprise réconciliateur).
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const admin = createAdminClient();

  // Débit borné par token (chaque appel crée une session MonCash payante).
  if (!(await rateLimit(admin, `biz-pay:${token}`, 8))) {
    return NextResponse.json(
      { error: "Trop de tentatives. Réessayez dans une minute." },
      { status: 429 }
    );
  }

  // Résolution SERVEUR de la facture par token — jamais d'ID exposé au client.
  const { data: inv } = await admin
    .from("zabelie_biz_invoices")
    .select("id, status, total_htg, paid_htg")
    .eq("public_token", token)
    .maybeSingle();
  if (!inv) {
    return NextResponse.json({ error: "Facture introuvable." }, { status: 404 });
  }
  if (!["sent", "partially_paid", "overdue"].includes(inv.status)) {
    return NextResponse.json(
      { error: "Cette facture n'est pas payable." },
      { status: 422 }
    );
  }

  const remaining = inv.total_htg - inv.paid_htg;
  if (remaining <= 0) {
    return NextResponse.json({ error: "Facture déjà réglée." }, { status: 422 });
  }

  const reference = `biz:${inv.id}:${randomBytes(4).toString("hex")}`;
  try {
    const { redirectUrl } = await createPayment(reference, remaining);
    return NextResponse.json({ redirectUrl });
  } catch {
    return NextResponse.json(
      { error: "Paiement MonCash indisponible pour le moment." },
      { status: 502 }
    );
  }
}
