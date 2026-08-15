import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSuspension } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingTable } from "@/lib/product-media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * L'opt-in du vendeur (docs/37 §A, option B) : offrir un taux d'affiliation
 * sur SON produit — ou le retirer. Pas de ligne = pas de prélèvement, jamais.
 *   POST   { productId, rateBps } — pose ou remplace le taux.
 *   DELETE { productId }          — retire l'offre.
 *
 * Les bornes (5–40 %) vivent en base (ZB081) : un refus arrive avec son
 * message exact. Poser un taux pendant que le programme est dormant est
 * PERMIS — c'est de la préparation, rien ne se prélève tant que
 * `config.actif` est false et qu'aucune attribution n'existe.
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
    .select("id, seller_id")
    .eq("id", productId)
    .single();
  if (!data || data.seller_id !== userId) return null;
  return admin;
}

export async function POST(req: Request) {
  const user = await session();
  if (!user) {
    return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  }
  if (await getSuspension(user.id)) {
    return NextResponse.json(
      { error: "Compte suspendu — action non autorisée." },
      { status: 403 }
    );
  }

  let body: { productId?: string; rateBps?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON requis" }, { status: 400 });
  }
  const rate = Number(body.rateBps);
  if (typeof body.productId !== "string" || !Number.isInteger(rate) || rate <= 0) {
    return NextResponse.json(
      { error: "productId et rateBps (entier, en points de base) requis" },
      { status: 400 }
    );
  }

  const admin = await produitDuVendeur(user.id, body.productId);
  if (!admin) {
    return NextResponse.json({ error: "Produit introuvable" }, { status: 404 });
  }

  const { error } = await admin
    .from("zabelie_affiliate_rates")
    .upsert({ product_id: body.productId, rate_bps: rate });
  if (error) {
    if (isMissingTable(error)) {
      return NextResponse.json(
        { error: "Affiliation non activée (0081 à appliquer)." },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 422 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const user = await session();
  if (!user) {
    return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  }

  let body: { productId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON requis" }, { status: 400 });
  }
  if (typeof body.productId !== "string") {
    return NextResponse.json({ error: "productId requis" }, { status: 400 });
  }

  const admin = await produitDuVendeur(user.id, body.productId);
  if (!admin) {
    return NextResponse.json({ error: "Produit introuvable" }, { status: 404 });
  }

  const { error } = await admin
    .from("zabelie_affiliate_rates")
    .delete()
    .eq("product_id", body.productId);
  if (error && !isMissingTable(error)) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
