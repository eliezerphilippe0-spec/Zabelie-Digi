import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { UUID_RE } from "@/lib/digital-studio";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const user = await getAdminUser();
  if (user?.role !== "admin") return NextResponse.json({ code: "forbidden" }, { status: 403 });
  const params = new URL(req.url).searchParams;
  const productId = params.get("productId") ?? ""; const assetId = params.get("assetId") ?? "";
  if (!UUID_RE.test(productId) || !UUID_RE.test(assetId)) return NextResponse.json({ code: "invalid_asset" }, { status: 422 });
  const admin = createAdminClient();
  const { data: asset } = await admin.from("product_assets").select("storage_path,file_name").eq("id", assetId).eq("product_id", productId).maybeSingle();
  if (!asset) return NextResponse.json({ code: "not_found" }, { status: 404 });
  const { data } = await admin.storage.from("product-files").createSignedUrl(asset.storage_path, 60 * 5, { download: asset.file_name });
  if (!data) return NextResponse.json({ code: "unavailable" }, { status: 503 });
  const response = NextResponse.redirect(data.signedUrl, 303); response.headers.set("Cache-Control", "private, no-store"); response.headers.set("Referrer-Policy", "no-referrer"); return response;
}
