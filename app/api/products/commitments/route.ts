import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSuspension } from "@/lib/auth";
import { getLang } from "@/lib/i18n-server";
import { marketplaceCopy } from "@/lib/marketplace-copy";
import { parseCommitment } from "@/lib/product-commitments";
import { UUID_RE } from "@/lib/digital-studio";
import { KIND_PHYSICAL, KIND_SERVICE } from "@/lib/product-kind";
import { rateLimit } from "@/lib/zabelie-rate-limit";

export async function PUT(req: Request) {
  const labels = marketplaceCopy(await getLang());
  const fail = (status: number) => NextResponse.json({ error: labels.error }, { status });
  if (!req.headers.get("content-type")?.includes("application/json")) return fail(415);
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return fail(400); }
  if (!body || typeof body !== "object" || typeof body.productId !== "string" || !UUID_RE.test(body.productId)) return fail(422);
  const details = parseCommitment(body.details);
  if (!details) return fail(422);
  try {
    const db = await createClient();
    const { data: { user } } = await db.auth.getUser();
    if (!user) return fail(401);
    if (await getSuspension(user.id)) return fail(403);
    const { data: product, error } = await db.from("products").select("id,kind").eq("id", body.productId).eq("seller_id", user.id).maybeSingle();
    if (error) return fail(503);
    if (!product) return fail(404);
    if (![KIND_PHYSICAL, KIND_SERVICE].includes(product.kind)) return fail(422);
    const admin = createAdminClient();
    if (!(await rateLimit(admin, `commitments:${user.id}`, 20))) return fail(429);
    const { data, error: writeError } = await admin.rpc("zabelie_save_product_commitment", {
      p_product: product.id, p_seller: user.id, p_zones: details.zones, p_pickup: details.pickup,
      p_days: details.delivery_days, p_fees: details.fees, p_next: details.next_available,
      p_confirm: details.confirmAvailability,
    }).single();
    if (writeError) return fail(503);
    return NextResponse.json({ ok: true, commitment: data }, { headers: { "Cache-Control": "no-store" } });
  } catch { return fail(503); }
}
