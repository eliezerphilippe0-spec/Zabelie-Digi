import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProfessional, slugify } from "@/lib/business";
import { rateLimit } from "@/lib/zabelie-rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/business/register  { displayName?, bio? }
 * Ouvre l'espace pro « Fè m peye » de l'utilisateur (idempotent : renvoie
 * l'existant). Aucune donnée sensible — insertion via service role après auth.
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

  // Déjà pro ? On renvoie l'espace existant (idempotent).
  const existing = await getProfessional(admin, user.id);
  if (existing) {
    return NextResponse.json({ professional: existing });
  }

  if (!(await rateLimit(admin, `biz-register:${user.id}`, 5))) {
    return NextResponse.json(
      { error: "Trop de tentatives. Réessayez dans une minute." },
      { status: 429 }
    );
  }

  let body: { displayName?: string; bio?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* corps optionnel */
  }

  // Nom d'affichage : celui fourni, sinon le profil, sinon l'email.
  const { data: profile } = await admin
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();
  const displayName =
    (body.displayName ?? "").trim() ||
    profile?.display_name ||
    user.email?.split("@")[0] ||
    "Professionnel";
  const bio = (body.bio ?? "").trim().slice(0, 400) || null;

  // Slug unique (suffixe aléatoire) — 3 tentatives suffisent largement.
  let inserted = null;
  for (let i = 0; i < 3 && !inserted; i++) {
    const { data, error } = await admin
      .from("zabelie_biz_professionals")
      .insert({ user_id: user.id, display_name: displayName, slug: slugify(displayName), bio })
      .select("id, user_id, display_name, slug, bio, next_invoice_seq")
      .single();
    if (!error) inserted = data;
    else if (/user_id/i.test(error.message)) {
      // Course : l'espace vient d'être créé (autre requête) → on le renvoie.
      const now = await getProfessional(admin, user.id);
      if (now) return NextResponse.json({ professional: now });
    } else if (!/duplicate|unique/i.test(error.message)) {
      return NextResponse.json({ error: "Création de l'espace pro échouée" }, { status: 500 });
    }
    // sinon (collision de slug) → nouvelle tentative avec un autre suffixe.
  }
  if (!inserted) {
    return NextResponse.json({ error: "Impossible de générer un identifiant unique" }, { status: 500 });
  }

  return NextResponse.json({ professional: inserted });
}
