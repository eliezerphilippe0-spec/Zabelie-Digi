import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { normalizeCouponCode } from "@/lib/zabelie-coupons";
import { UUID_RE } from "@/lib/collections";
import { erreurTraduite } from "@/lib/api-erreur";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Gestion des codes promo par le VENDEUR (V-13). Passe par le client
 * authentifié → RLS `coupons_seller_all` garantit qu'un vendeur ne voit et
 * ne modifie que SES codes. Le pourcentage est borné 1–90 en base.
 *
 * GET    → liste ses codes.
 * POST   { code, percent, expectedActorId, productId?, maxUses?, expiresAt? } → crée.
 * PATCH  { id, active } → active/désactive.
 */

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function GET() {
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: "Authentification requise" }, { status: 401 });

  const { data, error } = await supabase
    .from("zabelie_coupons")
    .select("id, code, percent, product_id, max_uses, uses, expires_at, active, created_at")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ coupons: data ?? [] });
}

export async function POST(req: Request) {
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: "Authentification requise" }, { status: 401 });

  let body: {
    code?: string;
    percent?: number;
    productId?: string | null;
    maxUses?: number | null;
    expiresAt?: string | null;
    expectedActorId?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  // Une remise ne doit pas être créée depuis l'écran d'un autre compte.
  // Le propriétaire reste exclusivement l'utilisateur vérifié par Auth.
  if (!body || typeof body !== "object" || Array.isArray(body)
    || typeof body.expectedActorId !== "string" || !UUID_RE.test(body.expectedActorId)) {
    return erreurTraduite("api.params.invalid", 422);
  }
  if (body.expectedActorId !== user.id) return erreurTraduite("api.auth.required", 403);

  const code = normalizeCouponCode(body.code ?? "");
  if (!code) {
    return NextResponse.json(
      { error: "Code invalide : 3–24 caractères, lettres/chiffres/tirets." },
      { status: 422 }
    );
  }
  const percent = Number(body.percent);
  if (!Number.isInteger(percent) || percent < 1 || percent > 90) {
    return NextResponse.json(
      { error: "Remise entre 1 et 90 %." },
      { status: 422 }
    );
  }

  const { data, error } = await supabase
    .from("zabelie_coupons")
    .insert({
      seller_id: user.id, // RLS with check : doit être soi-même
      code,
      percent,
      product_id: body.productId || null,
      max_uses: body.maxUses ?? null,
      expires_at: body.expiresAt || null,
    })
    .select("id, code, percent")
    .single();

  if (error) {
    const msg = error.message.includes("duplicate")
      ? "Ce code existe déjà dans votre boutique."
      : error.message;
    return NextResponse.json({ error: msg }, { status: 422 });
  }
  return NextResponse.json({ ok: true, coupon: data });
}

export async function PATCH(req: Request) {
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: "Authentification requise" }, { status: 401 });

  let body: { id?: string; active?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }
  if (!body.id || typeof body.active !== "boolean") {
    return NextResponse.json({ error: "id et active requis" }, { status: 400 });
  }

  const { error } = await supabase
    .from("zabelie_coupons")
    .update({ active: body.active })
    .eq("id", body.id); // RLS : seulement ses propres codes
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
