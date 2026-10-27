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
 *
 * Chaque refus part dans la langue du vendeur (`erreurTraduite`, audit du
 * 2026-10-27, M4) : l'écran affiche `error` tel quel. Jamais `error.message`
 * de Postgres — le journal garde le code.
 */

/** Codes Postgres d'une saisie refusée par la base — pas d'une panne. */
const SAISIE_REFUSEE = new Set(["23503", "22P02", "22007", "22003", "23514"]);

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function GET() {
  const { supabase, user } = await requireUser();
  if (!user) return erreurTraduite("api.auth.required", 401);

  const { data, error } = await supabase
    .from("zabelie_coupons")
    .select("id, code, percent, product_id, max_uses, uses, expires_at, active, created_at")
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[coupons] lecture impossible", error.code);
    return erreurTraduite("api.read.failed", 500);
  }
  return NextResponse.json({ coupons: data ?? [] });
}

export async function POST(req: Request) {
  const { supabase, user } = await requireUser();
  if (!user) return erreurTraduite("api.auth.required", 401);

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
    return erreurTraduite("api.json.invalid", 400);
  }

  // Une remise ne doit pas être créée depuis l'écran d'un autre compte.
  // Le propriétaire reste exclusivement l'utilisateur vérifié par Auth.
  if (!body || typeof body !== "object" || Array.isArray(body)
    || typeof body.expectedActorId !== "string" || !UUID_RE.test(body.expectedActorId)) {
    return erreurTraduite("api.params.invalid", 422);
  }
  if (body.expectedActorId !== user.id) return erreurTraduite("api.auth.required", 403);

  const code = normalizeCouponCode(body.code ?? "");
  if (!code) return erreurTraduite("api.coupon.code", 422);
  const percent = Number(body.percent);
  if (!Number.isInteger(percent) || percent < 1 || percent > 90) {
    return erreurTraduite("api.coupon.percent", 422);
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
    // Par CODE (`lib/pg-errors.ts`), jamais par le texte.
    // 23505 : l'unicité (vendeur, code) — le vendeur choisit un autre code.
    if (error.code === "23505") return erreurTraduite("api.coupon.exists", 422);
    // La base refuse la SAISIE : produit inconnu (23503), identifiant ou date
    // mal formés (22P02, 22007), nombre hors bornes (22003), contrainte de
    // valeur (23514). Ce n'est pas une panne : 422, rien au journal.
    if (SAISIE_REFUSEE.has(error.code ?? "")) return erreurTraduite("api.params.invalid", 422);
    // Le reste est une panne : 500, et le CODE seul au journal (le message de
    // Postgres peut citer la valeur saisie).
    console.error("[coupons] création refusée", error.code);
    return erreurTraduite("api.write.failed", 500);
  }
  return NextResponse.json({ ok: true, coupon: data });
}

export async function PATCH(req: Request) {
  const { supabase, user } = await requireUser();
  if (!user) return erreurTraduite("api.auth.required", 401);

  let body: { id?: string; active?: boolean };
  try {
    body = await req.json();
  } catch {
    return erreurTraduite("api.json.invalid", 400);
  }
  if (!body || typeof body !== "object" || !body.id || typeof body.active !== "boolean") {
    return erreurTraduite("api.params.invalid", 400);
  }

  // `.select("id")` : sous RLS, un code d'un AUTRE vendeur (écran resté ouvert
  // sur un autre compte) ou un code disparu ne met à jour AUCUNE ligne, sans
  // erreur. Sans relire ce qui a changé, la bascule annonçait un succès qui
  // n'avait pas eu lieu.
  const { data: modifies, error } = await supabase
    .from("zabelie_coupons")
    .update({ active: body.active })
    .eq("id", body.id) // RLS : seulement ses propres codes
    .select("id");
  if (error) {
    console.error("[coupons] bascule refusée", error.code);
    return erreurTraduite("api.write.failed", 500);
  }
  if (!modifies || modifies.length === 0) return erreurTraduite("api.coupon.notfound", 404);
  return NextResponse.json({ ok: true });
}
