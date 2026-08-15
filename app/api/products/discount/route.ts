import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSuspension } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingFunction } from "@/lib/pg-errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Rabais vendeur (V-4, docs/35).
 *   POST   { productId, newPriceHTG } — pose un rabais : le prix COURANT
 *          devient l'ancien prix barré (jamais une saisie libre), le
 *          nouveau prix doit être STRICTEMENT inférieur.
 *   DELETE { productId }              — retire le barré, le prix reste.
 *
 * Toute la règle vit dans les RPC de 0075 (propriété, baisse stricte,
 * variante unique, contrainte compare > prix). Sans 0075 : 503 explicite.
 */
async function session() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

const RAISONS: Record<string, string> = {
  introuvable: "Produit introuvable",
  prix_invalide: "Prix invalide (entier positif en HTG).",
  pas_une_baisse: "Un rabais BAISSE le prix — saisissez un prix inférieur au prix actuel.",
  variantes_multiples:
    "Ce produit a plusieurs variantes — le rabais par variante viendra ensuite.",
};

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

  let body: { productId?: string; newPriceHTG?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }
  const prix = Number(body.newPriceHTG);
  if (!body.productId || !Number.isInteger(prix) || prix <= 0) {
    return NextResponse.json(
      { error: "productId et nouveau prix (entier HTG) requis" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("zabelie_set_discount", {
    p_user_id: user.id,
    p_product_id: body.productId,
    p_new_price_htg: prix,
  });
  if (error) {
    if (isMissingFunction(error)) {
      return NextResponse.json(
        { error: "Rabais non activés (0075 à appliquer)." },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: "Rabais impossible" }, { status: 500 });
  }
  if (!data?.ok) {
    return NextResponse.json(
      { error: RAISONS[data?.reason as string] ?? "Rabais refusé.", code: data?.reason },
      { status: 422 }
    );
  }
  return NextResponse.json({
    ok: true,
    ancienHtg: data.ancien_htg,
    nouveauHtg: data.nouveau_htg,
  });
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
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }
  if (!body.productId) {
    return NextResponse.json({ error: "productId requis" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("zabelie_clear_discount", {
    p_user_id: user.id,
    p_product_id: body.productId,
  });
  if (error) {
    if (isMissingFunction(error)) {
      return NextResponse.json(
        { error: "Rabais non activés (0075 à appliquer)." },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: "Retrait impossible" }, { status: 500 });
  }
  if (!data?.ok) {
    return NextResponse.json({ error: "Produit introuvable" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, prixHtg: data.prix_htg });
}
