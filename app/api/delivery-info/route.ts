import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isMissingTable } from "@/lib/product-media";
import { getLang } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";
import { UUID_RE } from "@/lib/collections";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/delivery-info  { expectedActorId, fullName?, phone?, adresLiv? }
 * Coordonnées de livraison du compte connecté (V-5, docs/35).
 *
 * CLIENT DE SESSION, jamais le service-role : la RLS de
 * `zabelie_delivery_info` (0076) est le garde — own-row en écriture, et la
 * lecture vendeur n'existe qu'au moment d'expédier (commande payée). Une
 * route service-role contournerait précisément ce qu'on vient d'encoder.
 * Sans 0076 : 503 explicite.
 */
export async function POST(req: Request) {
  const lang = await getLang();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: t(lang, "api.auth.required") }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: t(lang, "api.json.invalid") }, { status: 400 });
  }
  // Une valeur non textuelle n'est pas une demande de retirer les coordonnées.
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return NextResponse.json({ error: t(lang, "api.params.invalid") }, { status: 422 });
  }
  const body = raw as Record<string, unknown>;
  // L'écran doit encore appartenir à la session qui va écrire ces données privées.
  // L'identité de session reste seule source du user_id sauvegardé.
  if (typeof body.expectedActorId !== "string" || !UUID_RE.test(body.expectedActorId)) {
    return NextResponse.json({ error: t(lang, "api.params.invalid") }, { status: 422 });
  }
  if (body.expectedActorId !== user.id) {
    return NextResponse.json({ error: t(lang, "api.auth.required") }, { status: 403 });
  }
  if (["fullName", "phone", "adresLiv"].some(key => body[key] !== undefined && typeof body[key] !== "string")) {
    return NextResponse.json({ error: t(lang, "api.params.invalid") }, { status: 422 });
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
        { error: t(lang, "api.unavailable") },
        { status: 503 }
      );
    }
    // Les contraintes de bornes (0076) remontent ici — message générique,
    // le détail vit en base.
    return NextResponse.json(
      { error: t(lang, "api.write.failed") },
      { status: 422 }
    );
  }
  return NextResponse.json({ ok: true });
}
