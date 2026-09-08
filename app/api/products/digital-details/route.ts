import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSuspension } from "@/lib/auth";
import { rateLimit } from "@/lib/zabelie-rate-limit";
import { getLang } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";
import { isDownloadable } from "@/lib/product-kind";
import { parseDigitalDetails } from "@/lib/digital-details";

export async function PUT(req: Request) {
  const lang = await getLang();
  const fail = (status: number, code: string) => NextResponse.json({ error: t(lang, "digital.save.error"), code }, { status });
  if (!req.headers.get("content-type")?.includes("application/json")) return fail(415, "json_required");
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return fail(401, "authentication_required");
  if (await getSuspension(user.id)) return fail(403, "suspended");
  let body: unknown;
  try { body = await req.json(); } catch { return fail(400, "invalid_json"); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return fail(422, "invalid_details");
  const { productId, details } = body as Record<string, unknown>;
  if (typeof productId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(productId)) return fail(422, "invalid_product");
  const parsed = parseDigitalDetails(details);
  if (!parsed) return fail(422, "invalid_details");
  const { data: product, error: readError } = await client.from("products")
    .select("id,seller_id,kind,status").eq("id", productId).eq("seller_id", user.id).maybeSingle();
  if (readError) return fail(503, "unavailable");
  if (!product) return fail(404, "not_found");
  if (!isDownloadable(product.kind) || product.status !== "draft") return fail(409, "draft_required");
  const admin = createAdminClient();
  if (!(await rateLimit(admin, `digital-details:${user.id}`, 10))) return fail(429, "rate_limited");
  const { error } = await admin.from("zabelie_digital_details").upsert({ product_id: productId, ...parsed }, { onConflict: "product_id" });
  if (error) return fail(error.code === "23514" ? 409 : 503, "save_failed");
  return NextResponse.json({ ok: true });
}
