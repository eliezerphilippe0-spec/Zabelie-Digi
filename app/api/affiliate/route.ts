import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSuspension } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingTable } from "@/lib/product-media";
import { affiliationActive, genererCode } from "@/lib/affiliation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Programme d'affiliation (docs/37 §A, migration 0081).
 *   GET  — mon code (null si je n'en ai pas).
 *   POST — devenir affilié : génère le code, idempotent.
 *
 * DORMANT tant que `zabelie_affiliate_config.actif` est false : 503 partout,
 * personne ne peut s'inscrire à un programme qui n'existe pas encore. Le
 * wallet d'un affilié est un wallet ordinaire — même maturation J+7, même
 * retrait, même KYC (0079).
 */
async function session() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

const DORMANT = () =>
  NextResponse.json(
    { error: "Programme d'affiliation non ouvert.", code: "affiliation_inactive" },
    { status: 503 }
  );

export async function GET() {
  const user = await session();
  if (!user) {
    return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  }
  const admin = createAdminClient();
  if (!(await affiliationActive(admin))) return DORMANT();

  const { data, error } = await admin
    .from("zabelie_affiliates")
    .select("code, created_at")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) {
    if (isMissingTable(error)) return DORMANT();
    return NextResponse.json({ error: "Lecture échouée" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, code: data?.code ?? null });
}

export async function POST() {
  const user = await session();
  if (!user) {
    return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  }
  if (await getSuspension(user.id)) {
    return NextResponse.json(
      { error: "Compte suspendu — action non autorisée." },
      { status: 403 }
    );
  }
  const admin = createAdminClient();
  if (!(await affiliationActive(admin))) return DORMANT();

  // Idempotent : déjà affilié → même code, jamais un second.
  const { data: existant } = await admin
    .from("zabelie_affiliates")
    .select("code")
    .eq("user_id", user.id)
    .maybeSingle();
  if (existant) return NextResponse.json({ ok: true, code: existant.code });

  // Collision de code : improbable (31^10), mais un unique en base la rend
  // impossible — trois essais puis un échec franc plutôt qu'une boucle.
  for (let i = 0; i < 3; i++) {
    const code = genererCode();
    const { error } = await admin
      .from("zabelie_affiliates")
      .insert({ user_id: user.id, code });
    if (!error) return NextResponse.json({ ok: true, code });
    if (isMissingTable(error)) return DORMANT();
    if (!/duplicate|unique/i.test(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }
  return NextResponse.json({ error: "Génération du code échouée" }, { status: 500 });
}
