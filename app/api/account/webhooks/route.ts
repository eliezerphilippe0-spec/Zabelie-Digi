import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireActiveAccount } from "@/lib/auth";
import { getLang } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";
import { rateLimit } from "@/lib/zabelie-rate-limit";
import { EVENEMENTS, genererSecret, urlWebhookValide } from "@/lib/webhooks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/account/webhooks — ajoute un point de terminaison au vendeur connecté.
 * Le secret de signature n'est rendu QU'ICI. Plafond de 3 actifs imposé en base (ZB122).
 */
export async function POST(req: Request) {
  const lang = await getLang();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: t(lang, "api.auth.required") }, { status: 401 });
  const bloque = await requireActiveAccount(user.id);
  if (bloque) return bloque;

  let corps: { url?: unknown; events?: unknown } = {};
  try { corps = await req.json(); } catch { /* corps absent : adresse invalide plus bas */ }
  const url = urlWebhookValide(corps.url);
  if (!url) return NextResponse.json({ error: t(lang, "webhooks.err.url"), code: "invalid_url" }, { status: 422 });
  const events = Array.isArray(corps.events) && corps.events.length
    ? [...new Set(corps.events)].filter((e): e is string => (EVENEMENTS as readonly unknown[]).includes(e))
    : [...EVENEMENTS];
  if (!events.length) return NextResponse.json({ error: t(lang, "webhooks.err.events"), code: "invalid_events" }, { status: 422 });

  const admin = createAdminClient();
  if (!(await rateLimit(admin, `webhooks:create:${user.id}`, 10))) {
    return NextResponse.json({ error: t(lang, "api.rate.limited"), code: "rate_limited" }, { status: 429 });
  }
  const secret = genererSecret();
  const { data, error } = await admin
    .from("zabelie_webhook_endpoints")
    .insert({ seller_id: user.id, url, secret, events })
    .select("id, url, events, created_at")
    .single();
  if (error) {
    if (error.code === "ZB122") return NextResponse.json({ error: t(lang, "webhooks.err.limit"), code: "endpoint_limit" }, { status: 409 });
    console.error("[webhooks] création refusée", error.code, error.message);
    return NextResponse.json({ error: t(lang, "api.unavailable"), code: "unavailable" }, { status: 503 });
  }
  return NextResponse.json({ ...data, secret }, { status: 201, headers: { "Cache-Control": "no-store" } });
}
