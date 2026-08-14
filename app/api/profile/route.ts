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
    zone_id?: string;
    pwen_repe?: string;
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

  // Zone déclarée (PR-Z3, 0069). Format seulement : le NIVEAU (komin ou
  // katye, jamais depatman) est gardé par le trigger ZB069 en base — on ne
  // duplique pas un garde qui existe déjà, on traduit son refus en 400.
  const rawZone = body.zone_id?.trim() || "";
  if (rawZone && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawZone)) {
    return NextResponse.json({ error: "Zone invalide" }, { status: 400 });
  }

  const rawPwen = body.pwen_repe?.trim() || "";
  if (rawPwen.length > 200) {
    return NextResponse.json({ error: "Point de repère trop long (200 max)" }, { status: 400 });
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      display_name: displayName,
      bio: body.bio?.trim() || null,
      avatar_url: body.avatar_url?.trim() || null,
      country_code: rawCountry || null,
      region_code: region,
      // `zone_id` TOUJOURS dans l'UPDATE, même null : c'est ce qui déclenche
      // le trigger de cohérence (0069) — zone posée → region_code dérivé et
      // le département saisi ci-dessus est écrasé (la zone est maître, Z-A) ;
      // zone nulle → le trigger ne touche rien, le département reste.
      zone_id: rawZone || null,
      pwen_repe: rawPwen || null,
    })
    .eq("id", user.id);

  if (error) {
    // ZB069 = zone d'un niveau non déclarable (depatman) ou incohérente —
    // une erreur de SAISIE, pas une panne : 400, avec le message du garde.
    if (error.message.includes("ZB069")) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
