import { randomUUID } from "node:crypto";
import { NextResponse, after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getLang } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";
import { rateLimit } from "@/lib/zabelie-rate-limit";
import { repartir } from "@/lib/webhooks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST — envoie un événement `webhook.test` factice au point de terminaison, pour
 * que le vendeur valide son adresse et sa vérification de signature. Le test ne
 * compte pas dans la désactivation automatique (0122).
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const lang = await getLang();
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: t(lang, "api.auth.required") }, { status: 401 });
  if (!UUID.test(id)) return NextResponse.json({ error: t(lang, "webhooks.err.notfound"), code: "not_found" }, { status: 404 });

  const admin = createAdminClient();
  if (!(await rateLimit(admin, `webhooks:test:${user.id}`, 5))) {
    return NextResponse.json({ error: t(lang, "api.rate.limited"), code: "rate_limited" }, { status: 429 });
  }
  const { data: point } = await admin
    .from("zabelie_webhook_endpoints").select("id")
    .eq("id", id).eq("seller_id", user.id).is("disabled_at", null).maybeSingle();
  if (!point) return NextResponse.json({ error: t(lang, "webhooks.err.notfound"), code: "not_found" }, { status: 404 });

  const eventId = randomUUID();
  const { error } = await admin.from("zabelie_webhook_deliveries").insert({
    endpoint_id: point.id, event_id: eventId, event_type: "webhook.test",
    payload: { id: eventId, type: "webhook.test", created_at: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"), data: { message: "Zabelie webhook test" } },
  });
  if (error) {
    console.error("[webhooks] test non enfilé", error.code, error.message);
    return NextResponse.json({ error: t(lang, "api.unavailable"), code: "unavailable" }, { status: 503 });
  }
  after(() => repartir(admin, { lots: 1 }));
  return NextResponse.json({ ok: true, eventId }, { status: 202 });
}
