import { NextResponse } from "next/server";
import { requireActiveAccount } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProfessional } from "@/lib/business";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/business/invoices/[id]/send
 * Fige la facture (brouillon → envoyée), génère le numéro lisible FCT-000123.
 * La fonction SQL refuse un total nul ou une facture déjà envoyée.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  }
  // Compte suspendu : aucun geste commercial ni contenu public (docs/78 L6).
  const accountRefusal = await requireActiveAccount(user.id);
  if (accountRefusal) return accountRefusal;

  const admin = createAdminClient();
  const pro = await getProfessional(admin, user.id);
  if (!pro) {
    return NextResponse.json({ error: "Espace pro requis." }, { status: 403 });
  }
  const { data: owned } = await admin
    .from("zabelie_biz_invoices")
    .select("id")
    .eq("id", id)
    .eq("professional_id", pro.id)
    .maybeSingle();
  if (!owned) {
    return NextResponse.json({ error: "Facture introuvable." }, { status: 404 });
  }

  const { data, error } = await admin.rpc("zabelie_biz_send_invoice", {
    p_invoice: id,
  });
  if (error) {
    return NextResponse.json(
      { error: "Envoi refusé (total nul ou déjà envoyée)." },
      { status: 422 }
    );
  }

  return NextResponse.json({
    invoiceNumber: data?.invoice_number ?? null,
    publicToken: data?.public_token ?? null,
    status: data?.status ?? null,
  });
}
