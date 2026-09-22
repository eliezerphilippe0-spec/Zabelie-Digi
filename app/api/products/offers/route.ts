import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSuspension } from "@/lib/auth";
import { getLang } from "@/lib/i18n-server";
import { erreurTraduite } from "@/lib/api-erreur";
import { offerCopy } from "@/lib/product-offer-copy";
import { OFFER_UUID, parseOfferSelection } from "@/lib/product-offers";
export const runtime = "nodejs";
export async function PUT(req: Request) {
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return erreurTraduite("api.auth.required", 401);
  if (await getSuspension(user.id)) return erreurTraduite("api.suspended", 403);
  const copy = offerCopy(await getLang());
  let body: unknown;
  try { body = await req.json(); } catch { return erreurTraduite("api.json.invalid", 400); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: copy.invalid }, { status: 400 });
  const { productId, offers, automatic } = body as Record<string, unknown>;
  const selection = parseOfferSelection(offers);
  if (typeof productId !== "string" || !OFFER_UUID.test(productId) || !selection || (automatic !== undefined && typeof automatic !== "boolean")) return NextResponse.json({ error: copy.invalid }, { status: 400 });
  const admin = createAdminClient();
  const params = { p_user_id: user.id, p_product_id: productId, p_targets: selection };
  const { data, error } = automatic === undefined
    ? await admin.rpc("zabelie_save_product_offers", params)
    : await admin.rpc("zabelie_configure_product_offers", { ...params, p_recommendations_enabled: automatic });
  if (error) return NextResponse.json({ error: copy.unavailable }, { status: 503 });
  if (!data?.ok) return NextResponse.json({ error: copy.invalid, code: data?.reason }, { status: data?.reason === "not_owner" ? 403 : 422 });
  return NextResponse.json({ ok: true });
}
