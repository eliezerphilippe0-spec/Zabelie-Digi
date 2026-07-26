import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isDownloadable } from "@/lib/product-kind";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "product-files"; // bucket privé Supabase Storage

/**
 * GET /api/download?orderId=...
 * Délivre une URL signée vers le fichier livrable — UNIQUEMENT si la commande
 * appartient au demandeur ET qu'elle est payée. Le fichier n'est jamais public.
 */
export async function GET(req: Request) {
  const orderId = new URL(req.url).searchParams.get("orderId");
  if (!orderId) {
    return NextResponse.json({ error: "orderId requis" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Commande payée, appartenant au demandeur.
  const { data: order, error: orderErr } = await admin
    .from("orders")
    .select("id, buyer_id, product_id, status")
    .eq("id", orderId)
    .single();

  if (orderErr || !order || order.buyer_id !== user.id) {
    return NextResponse.json({ error: "Commande introuvable" }, { status: 404 });
  }
  if (order.status !== "paid" && order.status !== "delivered") {
    return NextResponse.json({ error: "Paiement non confirmé" }, { status: 403 });
  }

  // Le produit se livre-t-il par téléchargement ? Cette route marque la
  // commande `delivered` : l'appeler pour un produit qui ne se télécharge pas
  // écrirait une livraison qui n'a pas eu lieu. Le contrôle passe donc AVANT
  // toute recherche de livrable.
  const { data: product } = await admin
    .from("products")
    .select("kind")
    .eq("id", order.product_id)
    .single();

  if (!product || !isDownloadable(product.kind)) {
    return NextResponse.json(
      {
        error: "Ce produit ne se livre pas par téléchargement.",
        code: "non_telechargeable",
      },
      { status: 409 }
    );
  }

  // Livrable du produit.
  const { data: asset } = await admin
    .from("product_assets")
    .select("storage_path, file_name")
    .eq("product_id", order.product_id)
    .limit(1)
    .single();

  if (!asset) {
    return NextResponse.json(
      { error: "Aucun fichier livrable pour ce produit." },
      { status: 404 }
    );
  }

  // URL signée 5 min.
  const { data: signed, error: signErr } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(asset.storage_path, 60 * 5, {
      download: asset.file_name,
    });

  if (signErr || !signed) {
    return NextResponse.json(
      { error: "Génération du lien échouée" },
      { status: 500 }
    );
  }

  // Marque la commande comme livrée (best-effort, idempotent).
  await admin.from("orders").update({ status: "delivered" }).eq("id", order.id);

  return NextResponse.json({ url: signed.signedUrl });
}
