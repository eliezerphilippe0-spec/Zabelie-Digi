import { NextResponse } from "next/server";
import { getDigitalAccess } from "@/lib/digital-studio-server";
import { createAdminClient } from "@/lib/supabase/admin";
import { UUID_RE } from "@/lib/digital-studio";
export async function PUT(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body || !UUID_RE.test(body.orderId) || !UUID_RE.test(body.releaseId) || !UUID_RE.test(body.lessonId) || typeof body.completed !== "boolean")
    return NextResponse.json({ code: "invalid_progress" }, { status: 422 });
  const access = await getDigitalAccess(body.orderId, body.releaseId);
  if (!access || !access.release.payload.lessons.some(l => l.id === body.lessonId)) return NextResponse.json({ code: "not_found" }, { status: 404 });
  const admin = createAdminClient();
  const { error } = await admin.from("zabelie_digital_progress").upsert({ order_id: body.orderId, release_id: body.releaseId, lesson_id: body.lessonId, completed: body.completed, updated_at: new Date().toISOString() });
  return error ? NextResponse.json({ code: "unavailable" }, { status: 503 }) : NextResponse.json({ ok: true });
}
