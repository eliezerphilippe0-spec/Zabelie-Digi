import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireActiveAccount } from "@/lib/auth";
import { getLang } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";
import { rateLimit } from "@/lib/zabelie-rate-limit";
import { genererCle, nomCleValide, SCOPES_PAR_DEFAUT } from "@/lib/api-keys";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/account/api-keys — crée une clé d'API pour le vendeur connecté.
 *
 * La clé en clair n'existe que dans CETTE réponse : la base n'en reçoit que
 * l'empreinte. Le plafond de 5 clés actives est imposé par la base (ZB121) —
 * la route le traduit, elle ne le recompte pas.
 */
export async function POST(req: Request) {
  const lang = await getLang();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: t(lang, "api.auth.required") }, { status: 401 });
  const bloque = await requireActiveAccount(user.id);
  if (bloque) return bloque;

  let corps: { name?: unknown } = {};
  try { corps = await req.json(); } catch { /* corps absent : nom invalide plus bas */ }
  const nom = nomCleValide(corps.name);
  if (!nom) return NextResponse.json({ error: t(lang, "apikeys.err.name"), code: "invalid_name" }, { status: 422 });

  const admin = createAdminClient();
  if (!(await rateLimit(admin, `apikeys:create:${user.id}`, 10))) {
    return NextResponse.json({ error: t(lang, "api.rate.limited"), code: "rate_limited" }, { status: 429 });
  }

  const { cle, prefixe, empreinte } = genererCle();
  const { data, error } = await admin
    .from("zabelie_api_keys")
    .insert({ seller_id: user.id, name: nom, prefix: prefixe, key_hash: empreinte, scopes: [...SCOPES_PAR_DEFAUT] })
    .select("id, name, prefix, scopes, created_at")
    .single();
  if (error) {
    if (error.code === "ZB121") {
      return NextResponse.json({ error: t(lang, "apikeys.err.limit"), code: "key_limit" }, { status: 409 });
    }
    console.error("[api-keys] création refusée", error.code, error.message);
    return NextResponse.json({ error: t(lang, "api.unavailable"), code: "unavailable" }, { status: 503 });
  }
  return NextResponse.json({ ...data, key: cle }, { status: 201, headers: { "Cache-Control": "no-store" } });
}
