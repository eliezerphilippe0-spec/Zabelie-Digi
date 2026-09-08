import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { rateLimit } from "@/lib/zabelie-rate-limit";
import { NextResponse } from "next/server";
import { getDigitalAccess } from "@/lib/digital-studio-server";
import { createAdminClient } from "@/lib/supabase/admin";
import { UUID_RE } from "@/lib/digital-studio";
export async function PUT(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ code: "authentication_required" }, { status: 401 });
  if (!req.headers.get("content-type")?.includes("application/json")) return NextResponse.json({ code: "json_required" }, { status: 415 });
  const body = await req.json().catch(() => null);
  if (!body || !UUID_RE.test(body.orderId) || !UUID_RE.test(body.releaseId) || !UUID_RE.test(body.lessonId) || typeof body.completed !== "boolean")
    return NextResponse.json({ code: "invalid_progress" }, { status: 422 });
  const access = await getDigitalAccess(body.orderId, body.releaseId);
  if (!access || !access.release.payload.lessons.some(l => l.id === body.lessonId)) return NextResponse.json({ code: "not_found" }, { status: 404 });
  const admin = createAdminClient();
  if (!(await rateLimit(admin, `digital-progress:${user.id}`, 60))) return NextResponse.json({ code: "rate_limited" }, { status: 429 });
  const { error } = await admin.from("zabelie_digital_progress").upsert({ order_id: body.orderId, release_id: body.releaseId, lesson_id: body.lessonId, completed: body.completed, updated_at: new Date().toISOString() });
  if (error) return NextResponse.json({ code: "unavailable" }, { status: 503 });
  revalidatePath(`/mes-achats/${body.orderId}`);
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
}
