import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSuspension } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingTable } from "@/lib/product-media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Ventes flash vendeur (docs/37 §B, migration 0080).
 *   POST   { productId, prixFlashHTG, dureeH, unitesMax? } — crée l'offre.
 *   DELETE { productId }                                   — annule l'offre vivante.
 *
 * La règle vit dans le trigger ZB080 (bornes de config, chevauchement,
 * plafond par vendeur) : cette route vérifie la PROPRIÉTÉ et traduit les
 * refus. Un `raise` de ZB080 arrive ici comme une erreur portant son
 * message — on le rend tel quel, il porte le détail. Sans 0080 : 503.
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
    return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  }
  if (await getSuspension(user.id)) {
    return NextResponse.json(
      { error: "Compte suspendu — action non autorisée." },
      { status: 403 }
    );
  }

  let body: {
    productId?: string;
    prixFlashHTG?: number;
    dureeH?: number;
    unitesMax?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON requis" }, { status: 400 });
  }

  const prix = Number(body.prixFlashHTG);
  const duree = Number(body.dureeH);
  if (
    typeof body.productId !== "string" ||
    !Number.isInteger(prix) ||
    prix <= 0 ||
    !Number.isInteger(duree) ||
    duree <= 0
  ) {
    return NextResponse.json(
      { error: "productId, prixFlashHTG (entier) et dureeH (entier) requis" },
      { status: 400 }
    );
  }
  const unites =
    body.unitesMax === undefined || body.unitesMax === null
      ? null
      : Number(body.unitesMax);
  if (unites !== null && (!Number.isInteger(unites) || unites <= 0)) {
    return NextResponse.json({ error: "unitesMax invalide" }, { status: 400 });
  }

  const ctx = await produitDuVendeur(user.id, body.productId);
  if (!ctx) {
    return NextResponse.json({ error: "Produit introuvable" }, { status: 404 });
  }

  const fin = new Date(Date.now() + duree * 3600_000).toISOString();
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
      return NextResponse.json(
        { error: "Ventes flash non activées (0080 à appliquer)." },
        { status: 503 }
      );
    }
    // Les refus ZB080 portent leur raison — on la transmet.
    return NextResponse.json({ error: error.message }, { status: 422 });
  }
  return NextResponse.json({ ok: true, id: data.id, fin: data.fin });
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

  const ctx = await produitDuVendeur(user.id, body.productId);
  if (!ctx) {
    return NextResponse.json({ error: "Produit introuvable" }, { status: 404 });
  }

  const { error } = await ctx.admin
    .from("zabelie_flash_sales")
    .update({ annulee_a: new Date().toISOString() })
    .eq("product_id", ctx.produit.id)
    .is("annulee_a", null)
    .gt("fin", new Date().toISOString());

  if (error) {
    if (isMissingTable(error)) {
      return NextResponse.json(
        { error: "Ventes flash non activées (0080 à appliquer)." },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
