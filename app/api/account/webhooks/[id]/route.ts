import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getLang } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** DELETE — désactive un point de terminaison du vendeur connecté (daté, jamais supprimé). */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const lang = await getLang();
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: t(lang, "api.auth.required") }, { status: 401 });
  if (!UUID.test(id)) return NextResponse.json({ error: t(lang, "webhooks.err.notfound"), code: "not_found" }, { status: 404 });

  const { data, error } = await createAdminClient()
    .from("zabelie_webhook_endpoints")
    .update({ disabled_at: new Date().toISOString(), disabled_reason: "seller" })
    .eq("id", id)
    .eq("seller_id", user.id)
    .is("disabled_at", null)
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("[webhooks] désactivation refusée", error.code, error.message);
    return NextResponse.json({ error: t(lang, "api.unavailable"), code: "unavailable" }, { status: 503 });
  }
  if (!data) return NextResponse.json({ error: t(lang, "webhooks.err.notfound"), code: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
