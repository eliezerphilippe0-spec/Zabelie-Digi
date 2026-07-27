import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkDisplayName } from "@/lib/display-name";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/profile  { display_name, bio, avatar_url }
 * Met à jour le profil public du créateur connecté (RLS : self update).
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  }

  let body: {
    display_name?: string;
    bio?: string;
    avatar_url?: string;
    country_code?: string;
    region_code?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  // La base remplacerait silencieusement un nom refusé (0045) — ici on le dit.
  // Sans ça, quelqu'un repart en croyant s'appeler comme il a écrit.
  const verdict = checkDisplayName(body.display_name);
  if (!verdict.ok) {
    return NextResponse.json(
      {
        error:
          verdict.reason === "brand"
            ? "Ce nom est réservé : il peut être confondu avec un compte officiel Zabelie. Choisissez-en un autre."
            : "Nom requis",
        code: verdict.reason,
      },
      { status: 400 },
    );
  }
  const displayName = verdict.value;

  // Pays : ISO-3166 alpha-2 en majuscules, ou vide → NULL.
  const rawCountry = body.country_code?.trim().toUpperCase() || "";
  if (rawCountry && !/^[A-Z]{2}$/.test(rawCountry)) {
    return NextResponse.json({ error: "Code pays invalide" }, { status: 400 });
  }

  // Département haïtien (ISO-3166-2:HT). N'a de sens que si pays = HT : sinon on
  // le remet à NULL pour éviter les incohérences.
  const rawRegion = body.region_code?.trim().toUpperCase() || "";
  if (rawRegion && !/^HT-[A-Z]{2}$/.test(rawRegion)) {
    return NextResponse.json({ error: "Département invalide" }, { status: 400 });
  }
  const region = rawCountry === "HT" ? rawRegion || null : null;

  const { error } = await supabase
    .from("profiles")
    .update({
      display_name: displayName,
      bio: body.bio?.trim() || null,
      avatar_url: body.avatar_url?.trim() || null,
      country_code: rawCountry || null,
      region_code: region,
    })
    .eq("id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
