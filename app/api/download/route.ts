import { resolveDigitalRelease } from "@/lib/digital-studio-server";
import { UUID_RE } from "@/lib/digital-studio";
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
  const params = new URL(req.url).searchParams;
  const orderId = params.get("orderId");
  const releaseId = params.get("releaseId") ?? undefined;
  const assetId = params.get("assetId");
  if (!orderId || !UUID_RE.test(orderId) || (releaseId && !UUID_RE.test(releaseId)) || (assetId && !UUID_RE.test(assetId))) {
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

  if (!product || !isDownloadable(product.kind, order.product_id)) {
    return NextResponse.json(
      {
        error: "Ce produit ne se livre pas par téléchargement.",
        code: "non_telechargeable",
      },
      { status: 409 }
    );
  }

  const access = await resolveDigitalRelease(admin, order.id, releaseId);
  // Never substitute the mutable current file for the acquired snapshot.
  const asset = access?.release.payload.files.find(f => !assetId || f.id === assetId);

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
  await admin.from("orders").update({ status: "delivered" }).eq("id", order.id).eq("buyer_id", user.id).eq("status", "paid");
  if (access) await admin.from("zabelie_digital_accesses").upsert({ order_id: order.id, release_id: access.release.id, asset_id: asset.id }, { onConflict: "order_id,release_id,asset_id", ignoreDuplicates: true });

  return NextResponse.json({ url: signed.signedUrl }, { headers: { "Cache-Control": "private, no-store" } });
}
