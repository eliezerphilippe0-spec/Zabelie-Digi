import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSuspension } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "product-covers";
// Photo prise au téléphone en Haïti : 5 Mo suffisent largement, et un upload
// plus lourd échouerait de toute façon sur une connexion 3G instable.
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Set(["jpg", "jpeg", "png", "webp"]);

/**
 * POST /api/products/cover  (multipart : productId, file)
 * Photo principale d'un produit — bucket PUBLIC (catalogue, cartes WhatsApp).
 * Réservé au vendeur propriétaire. Écrit products.cover_url.
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  }
  if (await getSuspension(user.id)) {
    return NextResponse.json(
      { error: "Compte suspendu — action non autorisée." },
      { status: 403 }
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Formulaire invalide" }, { status: 400 });
  }

  const productId = form.get("productId");
  const file = form.get("file");
  if (typeof productId !== "string" || !(file instanceof File)) {
    return NextResponse.json({ error: "productId et fichier requis" }, { status: 400 });
  }
  if (file.size === 0 || file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "Image entre 1 octet et 5 Mo requise." },
      { status: 422 }
    );
  }
  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  if (!ALLOWED.has(ext)) {
    return NextResponse.json(
      { error: "Formats acceptés : JPG, PNG, WebP." },
      { status: 422 }
    );
  }

  const admin = createAdminClient();
  // Propriété : seul le vendeur du produit peut poser sa photo.
  const { data: product } = await admin
    .from("products")
    .select("id, seller_id")
    .eq("id", productId)
    .single();
  if (!product || product.seller_id !== user.id) {
    return NextResponse.json({ error: "Produit introuvable" }, { status: 404 });
  }

  // Nom de fichier SERVEUR (jamais celui du client — pas de path traversal).
  const path = `${product.id}/cover.${ext}`;
  const { error: upErr } = await admin.storage
    .from(BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type || undefined });
  if (upErr) {
    return NextResponse.json({ error: "Envoi de l'image échoué" }, { status: 502 });
  }

  const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(path);
  // Cache-buster : upsert garde le même chemin, le CDN servirait l'ancienne.
  const coverUrl = `${pub.publicUrl}?v=${Date.now()}`;

  const { error: updErr } = await admin
    .from("products")
    .update({ cover_url: coverUrl })
    .eq("id", product.id);
  if (updErr) {
    return NextResponse.json({ error: "Enregistrement échoué" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, coverUrl });
}
