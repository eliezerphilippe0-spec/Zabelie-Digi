import { NextResponse } from "next/server";
import { requireActiveAccount } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProfessional } from "@/lib/business";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Vérifie que la facture existe ET appartient à l'utilisateur courant.
 * Le service role contourne la RLS → la propriété est contrôlée ICI.
 */
async function ownedInvoice(
  admin: ReturnType<typeof createAdminClient>,
  invoiceId: string,
  userId: string
) {
  const pro = await getProfessional(admin, userId);
  if (!pro) return null;
  const { data } = await admin
    .from("zabelie_biz_invoices")
    .select("id, status")
    .eq("id", invoiceId)
    .eq("professional_id", pro.id)
    .maybeSingle();
  return data ?? null;
}

/**
 * POST /api/business/invoices/[id]/items  { label, qty, unitPrice, itemId? }
 * Ajoute (ou met à jour) une ligne. Total RECALCULÉ serveur par la fonction SQL
 * (jamais fourni par le client). Refusé hors statut brouillon (garde SQL).
 */
export async function POST(
  req: Request,
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
  const invoice = await ownedInvoice(admin, id, user.id);
  if (!invoice) {
    return NextResponse.json({ error: "Facture introuvable." }, { status: 404 });
  }

  let body: { label?: string; qty?: number; unitPrice?: number; itemId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const label = (body.label ?? "").trim().slice(0, 160);
  const qty = Math.trunc(Number(body.qty));
  const unitPrice = Math.trunc(Number(body.unitPrice));
  if (!label) {
    return NextResponse.json({ error: "Description requise." }, { status: 422 });
  }
  if (!Number.isFinite(qty) || qty <= 0) {
    return NextResponse.json({ error: "Quantité invalide (> 0)." }, { status: 422 });
  }
  if (!Number.isFinite(unitPrice) || unitPrice < 0) {
    return NextResponse.json({ error: "Prix unitaire invalide (≥ 0)." }, { status: 422 });
  }

  const { data, error } = await admin.rpc("zabelie_biz_upsert_item", {
    p_invoice: id,
    p_label: label,
    p_qty: qty,
    p_unit_price: unitPrice,
    p_item: body.itemId ?? null,
  });
  if (error) {
    // La fonction refuse notamment si la facture n'est plus en brouillon.
    return NextResponse.json(
      { error: "Ligne refusée (facture peut-être déjà envoyée)." },
      { status: 422 }
    );
  }

  return NextResponse.json({ itemId: data });
}

/**
 * DELETE /api/business/invoices/[id]/items?itemId=...
 * Supprime une ligne (brouillon uniquement) puis laisse la fonction de recalcul
 * remettre le total à jour.
 */
export async function DELETE(
  req: Request,
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

  const admin = createAdminClient();
  const invoice = await ownedInvoice(admin, id, user.id);
  if (!invoice) {
    return NextResponse.json({ error: "Facture introuvable." }, { status: 404 });
  }
  if (invoice.status !== "draft") {
    return NextResponse.json(
      { error: "Facture déjà envoyée : elle n'est plus modifiable." },
      { status: 422 }
    );
  }

  const itemId = new URL(req.url).searchParams.get("itemId");
  if (!itemId) {
    return NextResponse.json({ error: "itemId requis" }, { status: 400 });
  }

  await admin
    .from("zabelie_biz_invoice_items")
    .delete()
    .eq("id", itemId)
    .eq("invoice_id", id);
  await admin.rpc("zabelie_biz_recompute_invoice", { p_invoice: id });

  return NextResponse.json({ ok: true });
}
