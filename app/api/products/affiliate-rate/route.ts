import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireActiveAccount } from "@/lib/auth";
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
 * Les bornes (5–40 %) vivent en base (ZB081) : un refus revient avec le CODE
 * `ZB081` et non le texte du trigger — le client l'affiche dans la langue du
 * vendeur. Poser un taux pendant que le programme est dormant est
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
  const accountRefusal = await requireActiveAccount(user.id);
  if (accountRefusal) return accountRefusal;

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
    // Hors bornes : la seule erreur que le vendeur peut corriger lui-même. Le
    // CODE part au client, qui l'affiche dans la langue du vendeur avec les
    // bornes qu'il connaît déjà — jamais le texte du trigger (audit SEC-02).
    if (/ZB081/.test(error.message)) {
      return NextResponse.json({ error: "Taux hors bornes.", code: "ZB081" }, { status: 422 });
    }
    // Toute autre erreur reste côté serveur : ni structure interne ni message
    // de base ne sortent. Le code SQL suffit au journal, aucun identifiant.
    console.error("[affiliate-rate] écriture échouée", { code: error.code });
    return NextResponse.json({ error: "Écriture impossible." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const user = await session();
  if (!user) {
    return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  }
  // Même garde que le POST (audit SEC-01) : un compte suspendu ne gère plus ses
  // offres. Sans effet sur l'argent, mais deux verbes d'une même route ne
  // doivent pas avoir deux politiques d'accès.
  const accountRefusal = await requireActiveAccount(user.id);
  if (accountRefusal) return accountRefusal;

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
    console.error("[affiliate-rate] suppression échouée", { code: error.code });
    return NextResponse.json({ error: "Suppression impossible." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
