import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isMissingTable } from "@/lib/product-media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/delivery-info  { fullName?, phone?, adresLiv? }
 * Coordonnées de livraison du compte connecté (V-5, docs/35).
 *
 * CLIENT DE SESSION, jamais le service-role : la RLS de
 * `zabelie_delivery_info` (0076) est le garde — own-row en écriture, et la
 * lecture vendeur n'existe qu'au moment d'expédier (commande payée). Une
 * route service-role contournerait précisément ce qu'on vient d'encoder.
 * Sans 0076 : 503 explicite.
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  }

  let body: { fullName?: string; phone?: string; adresLiv?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const champ = (v: unknown, max: number) =>
    typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
  const fullName = champ(body.fullName, 120);
  const phone = champ(body.phone, 30);
  const adresLiv = champ(body.adresLiv, 240);

  const { error } = await supabase.from("zabelie_delivery_info").upsert({
    user_id: user.id,
    full_name: fullName,
    phone,
    adres_liv: adresLiv,
    updated_at: new Date().toISOString(),
  });
  if (error) {
    if (isMissingTable(error)) {
      return NextResponse.json(
        { error: "Coordonnées non activées (0076 à appliquer)." },
        { status: 503 }
      );
    }
    // Les contraintes de bornes (0076) remontent ici — message générique,
    // le détail vit en base.
    return NextResponse.json(
      { error: "Enregistrement refusé — vérifiez les champs." },
      { status: 422 }
    );
  }
  return NextResponse.json({ ok: true });
}
