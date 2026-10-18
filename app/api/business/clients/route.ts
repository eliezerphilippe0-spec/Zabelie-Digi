import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProfessional } from "@/lib/business";
import { rateLimit } from "@/lib/zabelie-rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/business/clients  { name, phone?, email? }
 * Ajoute un client au répertoire du pro (données non sensibles ; insertion
 * bornée après auth + vérification que l'appelant est bien le pro).
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  }

  const admin = createAdminClient();
  const pro = await getProfessional(admin, user.id);
  if (!pro) {
    return NextResponse.json({ error: "Ouvre d'abord ton espace pro." }, { status: 403 });
  }

  if (!(await rateLimit(admin, `biz-client:${user.id}`, 20))) {
    return NextResponse.json(
      { error: "Trop de créations. Réessayez dans une minute." },
      { status: 429 }
    );
  }

  let body: { name?: string; phone?: string; email?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const name = (body.name ?? "").trim().slice(0, 120);
  if (!name) {
    return NextResponse.json({ error: "Le nom du client est requis." }, { status: 422 });
  }
  const phone = (body.phone ?? "").trim().slice(0, 40) || null;
  const email = (body.email ?? "").trim().slice(0, 160) || null;

  const { data, error } = await admin
    .from("zabelie_biz_clients")
    .insert({ professional_id: pro.id, name, phone, email })
    .select("id, name, phone, email")
    .single();
  if (error || !data) {
    return NextResponse.json({ error: "Création du client échouée" }, { status: 500 });
  }

  return NextResponse.json({ client: data });
}
