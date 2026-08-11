import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Le panier de l'acheteur — ajout et retrait.
 *
 * CLIENT DE SESSION, jamais le service role : le panier est la propriété de
 * son acheteur, la RLS de `0058` le garantit, et une route qui contournerait
 * la RLS pour écrire dans un panier devrait alors prouver elle-même à qui il
 * appartient. Ici, la base refuse d'elle-même le panier d'autrui.
 *
 * L'identité de l'acheteur vient de `auth.uid()` DANS la fonction SQL — pas
 * d'un paramètre. Une route qui transmettrait un `buyerId` laisserait au
 * navigateur le soin de dire qui il est.
 */
async function identifier() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function POST(req: Request) {
  const { supabase, user } = await identifier();
  if (!user) {
    return NextResponse.json({ error: "Connexion requise" }, { status: 401 });
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

  const { error } = await supabase.rpc("zabelie_cart_add", {
    p_product_id: body.productId,
  });

  if (error) {
    // ZB058 porte les refus MÉTIER (produit non publié, son propre produit) :
    // ils méritent 422 et leur message, pas un 500 muet. Le reste est un
    // incident, et son détail ne sort pas.
    if (error.code === "ZB058") {
      return NextResponse.json(
        { error: error.message.replace(/^zabelie_cart_add: /, "") },
        { status: 422 }
      );
    }
    // Schéma en retard (0058 non appliquée) : le dire au journal, rendre un
    // message tenable à l'acheteur. Sans cette ligne, « le panier ne marche
    // pas » et « la migration n'est pas passée » se ressemblent.
    console.log(
      "[panier]",
      JSON.stringify({ at: new Date().toISOString(), issue: "ajout_impossible", message: error.message })
    );
    return NextResponse.json({ error: "Panier indisponible" }, { status: 503 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const { supabase, user } = await identifier();
  if (!user) {
    return NextResponse.json({ error: "Connexion requise" }, { status: 401 });
  }

  const productId = new URL(req.url).searchParams.get("productId");
  if (!productId) {
    return NextResponse.json({ error: "productId requis" }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("zabelie_cart_remove", {
    p_product_id: productId,
  });
  if (error) {
    console.log(
      "[panier]",
      JSON.stringify({ at: new Date().toISOString(), issue: "retrait_impossible", message: error.message })
    );
    return NextResponse.json({ error: "Panier indisponible" }, { status: 503 });
  }
  // `retirees: 0` n'est pas une erreur : retirer ce qui n'y est plus est le
  // résultat attendu d'un double-clic.
  return NextResponse.json({ ok: true, retirees: Number(data ?? 0) });
}
