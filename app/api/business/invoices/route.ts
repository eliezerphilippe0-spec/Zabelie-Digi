import { NextResponse } from "next/server";
import { requireActiveAccount } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProfessional, invoiceToken } from "@/lib/business";
import { rateLimit } from "@/lib/zabelie-rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/business/invoices  { clientId, dueDate? }
 * Crée une facture BROUILLON (montants à 0 — remplis ensuite ligne à ligne via
 * les fonctions serveur). Vérifie que le client appartient bien au pro.
 */
export async function POST(req: Request) {
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
    return NextResponse.json({ error: "Ouvre d'abord ton espace pro." }, { status: 403 });
  }

  if (!(await rateLimit(admin, `biz-invoice:${user.id}`, 20))) {
    return NextResponse.json(
      { error: "Trop de créations. Réessayez dans une minute." },
      { status: 429 }
    );
  }

  let body: { clientId?: string; dueDate?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  if (!body.clientId) {
    return NextResponse.json({ error: "Client requis." }, { status: 422 });
  }

  // Le client doit appartenir à CE pro (anti-références croisées).
  const { data: client } = await admin
    .from("zabelie_biz_clients")
    .select("id")
    .eq("id", body.clientId)
    .eq("professional_id", pro.id)
    .maybeSingle();
  if (!client) {
    return NextResponse.json({ error: "Client introuvable." }, { status: 404 });
  }

  // Date d'échéance optionnelle (AAAA-MM-JJ) — validée simplement.
  let dueDate: string | null = null;
  if (body.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(body.dueDate)) {
    dueDate = body.dueDate;
  }

  const { data, error } = await admin
    .from("zabelie_biz_invoices")
    .insert({
      professional_id: pro.id,
      client_id: client.id,
      public_token: invoiceToken(),
      due_date: dueDate,
    })
    .select("id")
    .single();
  if (error || !data) {
    return NextResponse.json({ error: "Création de la facture échouée" }, { status: 500 });
  }

  return NextResponse.json({ invoiceId: data.id });
}
