import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSuspension } from "@/lib/auth";
import { rateLimit } from "@/lib/zabelie-rate-limit";
import { getLang } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";
import { isDownloadable } from "@/lib/product-kind";
import { parseDigitalStudio, UUID_RE } from "@/lib/digital-studio";
export const runtime = "nodejs";
async function handle(req: Request, action: "save" | "revise" | "remove") {
  const lang = await getLang();
  const fail = (status: number, code: string) => NextResponse.json({ error: t(lang, "studio.error"), code }, { status });
  if (!req.headers.get("content-type")?.includes("application/json")) return fail(415, "json_required");
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return fail(401, "authentication_required");
  if (await getSuspension(user.id)) return fail(403, "suspended");
  const raw = await req.text();
  if (raw.length > 200000) return fail(413, "too_large");
  let body: Record<string, unknown>;
  try { body = JSON.parse(raw); } catch { return fail(400, "invalid_json"); }
  if (!body || typeof body !== "object" || !UUID_RE.test(String(body.productId))) return fail(422, "invalid_product");
  const productId = String(body.productId);
  const { data: product, error: readError } = await client.from("products").select("id,seller_id,kind,status")
    .eq("id", productId).eq("seller_id", user.id).maybeSingle();
  if (readError) return fail(503, "unavailable");
  if (!product) return fail(404, "not_found");
  if (!isDownloadable(product.kind)) return fail(409, "digital_required");
  const admin = createAdminClient();
  if (!(await rateLimit(admin, `digital-studio:${user.id}`, 15))) return fail(429, "rate_limited");
  if (action === "revise") {
    if (product.status !== "published") return fail(409, "published_required");
    const { error } = await admin.from("products").update({ status: "draft" }).eq("id", productId).eq("seller_id", user.id).eq("status", "published");
    return error ? fail(503, "revision_failed") : NextResponse.json({ ok: true });
  }
  if (product.status !== "draft") return fail(409, "draft_required");
  if (action === "remove") {
    if (!UUID_RE.test(String(body.assetId))) return fail(422, "invalid_asset");
    // Remove only the draft reference; immutable releases retain the stored file.
    const { error } = await admin.from("product_assets").delete().eq("id", String(body.assetId)).eq("product_id", productId);
    return error ? fail(409, "remove_failed") : NextResponse.json({ ok: true });
  }
  const parsed = parseDigitalStudio(body.studio);
  if (!parsed) return fail(422, "invalid_studio");
  const { data: assets, error: assetError } = await admin.from("product_assets").select("id").eq("product_id", productId);
  if (assetError) return fail(503, "assets_unavailable");
  if (parsed.lessons.some(l => l.assetId && !assets?.some(a => a.id === l.assetId))) return fail(422, "unknown_resource");
  const { error } = await admin.from("zabelie_digital_studio").upsert({ product_id: productId, ...parsed }, { onConflict: "product_id" });
  return error ? fail(error.code === "23514" ? 409 : 503, "save_failed") : NextResponse.json({ ok: true });
}
export const PUT = (req: Request) => handle(req, "save");
export const POST = (req: Request) => handle(req, "revise");
export const DELETE = (req: Request) => handle(req, "remove");
