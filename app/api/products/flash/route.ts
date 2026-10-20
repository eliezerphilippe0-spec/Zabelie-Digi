import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireActiveAccount } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingTable } from "@/lib/product-media";
import { erreurTraduite } from "@/lib/api-erreur";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Ventes flash vendeur (docs/37 §B, migration 0080).
 *   POST   { productId, prixFlashHTG, dureeH, unitesMax? } — crée l'offre.
 *   DELETE { productId }                                   — annule l'offre vivante.
 *
 * La règle vit dans le trigger ZB080 (bornes de config, chevauchement,
 * plafond par vendeur) : cette route vérifie la PROPRIÉTÉ et traduit les
 * refus sans exposer le message SQL. Sans 0080 : 503.
 */
async function session() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

async function produitDuVendeur(userId: string, productId: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("products")
    .select("id, seller_id, price_htg, status")
    .eq("id", productId)
    .single();
  if (!data || data.seller_id !== userId) return null;
  return { admin, produit: data };
}

export async function POST(req: Request) {
  const user = await session();
  if (!user) {
    return erreurTraduite("api.auth.required", 401);
  }
  const accountRefusal = await requireActiveAccount(user.id);
  if (accountRefusal) return accountRefusal;

  let body: {
    productId?: string;
    prixFlashHTG?: number;
    dureeH?: number;
    unitesMax?: number;
  };
  try {
    body = await req.json();
  } catch {
    return erreurTraduite("api.json.invalid", 400);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return erreurTraduite("api.params.invalid", 400);

  const prix = Number(body.prixFlashHTG);
  const duree = Number(body.dureeH);
  if (
    typeof body.productId !== "string" ||
    !Number.isSafeInteger(prix) ||
    prix <= 0 ||
    !Number.isInteger(duree) ||
    duree <= 0
  ) {
    return erreurTraduite("api.params.invalid", 400);
  }
  const unites =
    body.unitesMax === undefined || body.unitesMax === null
      ? null
      : Number(body.unitesMax);
  if (unites !== null && (!Number.isInteger(unites) || unites <= 0 || unites > 2147483647)) {
    return erreurTraduite("api.params.invalid", 400);
  }
  const finMs = Date.now() + duree * 3600_000;
  if (!Number.isFinite(finMs) || Math.abs(finMs) > 8_640_000_000_000_000) return erreurTraduite("api.params.invalid", 400);

  const ctx = await produitDuVendeur(user.id, body.productId);
  if (!ctx) {
    return erreurTraduite("api.product.notfound", 404);
  }

  const fin = new Date(finMs).toISOString();
  const { data, error } = await ctx.admin
    .from("zabelie_flash_sales")
    .insert({
      product_id: ctx.produit.id,
      prix_flash_htg: prix,
      fin,
      unites_max: unites,
    })
    .select("id, fin")
    .single();

  if (error) {
    if (isMissingTable(error)) {
      return erreurTraduite("api.unavailable", 503);
    }
    console.error("[flash] création refusée", error.code);
    return erreurTraduite("api.write.failed", 422);
  }
  return NextResponse.json({ ok: true, id: data.id, fin: data.fin });
}

export async function DELETE(req: Request) {
  const user = await session();
  if (!user) {
    return erreurTraduite("api.auth.required", 401);
  }

  let body: { productId?: string };
  try {
    body = await req.json();
  } catch {
    return erreurTraduite("api.json.invalid", 400);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return erreurTraduite("api.params.invalid", 400);
  if (typeof body.productId !== "string") {
    return erreurTraduite("api.params.invalid", 400);
  }

  const ctx = await produitDuVendeur(user.id, body.productId);
  if (!ctx) {
    return erreurTraduite("api.product.notfound", 404);
  }

  const { error } = await ctx.admin
    .from("zabelie_flash_sales")
    .update({ annulee_a: new Date().toISOString() })
    .eq("product_id", ctx.produit.id)
    .is("annulee_a", null)
    .gt("fin", new Date().toISOString());

  if (error) {
    if (isMissingTable(error)) {
      return erreurTraduite("api.unavailable", 503);
    }
    console.error("[flash] annulation refusée", error.code);
    return erreurTraduite("api.write.failed", 500);
  }
  return NextResponse.json({ ok: true });
}
