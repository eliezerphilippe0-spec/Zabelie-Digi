import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { collectionKind, COLLECTIONS, UUID_RE } from "@/lib/collections";
import { getLang } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";
export const dynamic = "force-dynamic";

/** Desired-state writes are idempotent; identity never comes from the body. */
export async function POST(req: Request) {
  const lang = await getLang();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: t(lang, "api.auth.required") }, { status: 401 });
  let body;
  try { body = await req.json(); } catch { body = null; }
  const kind = collectionKind(body?.kind);
  if (!kind || typeof body?.id !== "string" || !UUID_RE.test(body.id) || typeof body?.saved !== "boolean") {
    return NextResponse.json({ error: t(lang, "api.status.invalid") }, { status: 400 });
  }
  const config = COLLECTIONS[kind];
  const query = supabase.from(config.table);
  const { error } = body.saved
    ? await query.upsert({ user_id: user.id, [config.column]: body.id }, { onConflict: `user_id,${config.column}`, ignoreDuplicates: true })
    : await query.delete().eq("user_id", user.id).eq(config.column, body.id);
  if (error) return NextResponse.json({ error: t(lang, "collections.error") }, { status: error.code === "42501" || error.code === "23514" ? 422 : 503 });
  return NextResponse.json({ saved: body.saved }, { headers: { "Cache-Control": "no-store" } });
}
