import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSuspension } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  MAX_IMAGES_PER_PRODUCT,
  MEDIA_BUCKET,
  isMissingTable,
} from "@/lib/product-media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Même régime que la couverture : photo de téléphone, 5 Mo suffisent, et un
// upload plus lourd échouerait de toute façon sur une 3G instable.
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Set(["jpg", "jpeg", "png", "webp"]);

/**
 * Galerie produit (V-1A, docs/35).
 *   POST   (multipart : productId, file)  — ajoute UNE photo (≤ 6/produit).
 *   DELETE { productId, mediaId }         — retire une photo (stockage + ligne).
 *
 * Réservé au vendeur propriétaire. Le plafond est REDIT en base (ZB073) :
 * la vérification app-side seule se contournerait par appels concurrents.
 * Tant que 0073 n'est pas appliquée : 503, et la fiche vit sans galerie.
 * ⚠️ Aucune vidéo par cette route — la tranche B passera par un lien signé
 * (une route serverless plafonne son corps bien en dessous d'une vidéo).
 */
async function verifierProprietaire(userId: string, productId: string) {
  const admin = createAdminClient();
  const { data: product } = await admin
    .from("products")
    .select("id, seller_id")
    .eq("id", productId)
    .single();
  if (!product || product.seller_id !== userId) return null;
  return { admin, product };
}

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

  const ctx = await verifierProprietaire(user.id, productId);
  if (!ctx) {
    return NextResponse.json({ error: "Produit introuvable" }, { status: 404 });
  }
  const { admin, product } = ctx;

  // Plafond lisible AVANT l'upload (le trigger ZB073 reste le juge de paix).
  const { count, error: countErr } = await admin
    .from("zabelie_product_media")
    .select("id", { count: "exact", head: true })
    .eq("product_id", product.id)
    .eq("kind", "image");
  if (countErr) {
    if (isMissingTable(countErr)) {
      return NextResponse.json(
        { error: "Galerie non activée (0073 à appliquer)." },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: "Lecture de la galerie échouée" }, { status: 500 });
  }
  if ((count ?? 0) >= MAX_IMAGES_PER_PRODUCT) {
    return NextResponse.json(
      { error: `Maximum ${MAX_IMAGES_PER_PRODUCT} photos par produit.` },
      { status: 422 }
    );
  }

  // Nom de fichier SERVEUR (jamais celui du client — pas de path traversal).
  const path = `${product.id}/galerie/${crypto.randomUUID()}.${ext}`;
  const { error: upErr } = await admin.storage
    .from(MEDIA_BUCKET)
    .upload(path, file, { contentType: file.type || undefined });
  if (upErr) {
    return NextResponse.json({ error: "Envoi de l'image échoué" }, { status: 502 });
  }

  const { data: ligne, error: insErr } = await admin
    .from("zabelie_product_media")
    .insert({
      product_id: product.id,
      kind: "image",
      storage_path: path,
      position: count ?? 0,
    })
    .select("id")
    .single();
  if (insErr || !ligne) {
    // L'objet ne doit pas rester orphelin : on nettoie, puis on échoue.
    await admin.storage.from(MEDIA_BUCKET).remove([path]);
    return NextResponse.json({ error: "Enregistrement échoué" }, { status: 500 });
  }

  const { data: pub } = admin.storage.from(MEDIA_BUCKET).getPublicUrl(path);
  return NextResponse.json({ ok: true, id: ligne.id, url: pub.publicUrl });
}

export async function DELETE(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  }

  let body: { productId?: string; mediaId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }
  if (!body.productId || !body.mediaId) {
    return NextResponse.json({ error: "productId et mediaId requis" }, { status: 400 });
  }

  const ctx = await verifierProprietaire(user.id, body.productId);
  if (!ctx) {
    return NextResponse.json({ error: "Produit introuvable" }, { status: 404 });
  }
  const { admin, product } = ctx;

  // La ligne d'abord (elle porte le chemin), le stockage ensuite.
  const { data: media, error: readErr } = await admin
    .from("zabelie_product_media")
    .select("id, storage_path")
    .eq("id", body.mediaId)
    .eq("product_id", product.id)
    .single();
  if (readErr || !media) {
    return NextResponse.json({ error: "Média introuvable" }, { status: 404 });
  }

  const { error: delErr } = await admin
    .from("zabelie_product_media")
    .delete()
    .eq("id", media.id);
  if (delErr) {
    return NextResponse.json({ error: "Suppression échouée" }, { status: 500 });
  }
  // Best-effort : un objet orphelin au stockage est un déchet, pas une faille.
  await admin.storage.from(MEDIA_BUCKET).remove([media.storage_path]);

  return NextResponse.json({ ok: true });
}
