import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSuspension } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  COVER_MAX_OCTETS,
  COVER_MAX_DIMENSION,
  dimensionsDepuisEntete,
} from "@/lib/image-limits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "product-covers";
const ALLOWED = new Set(["jpg", "jpeg", "png", "webp"]);

/* ─── LE SERVEUR EST UN PLAFOND, PAS LE MÉCANISME ──────────────────────────
 * La compression vit dans le NAVIGATEUR (`lib/image-compress.ts`) : c'est là
 * qu'elle évite au vendeur de pousser 6 Mo sur une connexion Digicel
 * dégradée. Mais un client peut être contourné — un `curl` direct sur cette
 * route ne passe par aucun canvas. D'où ce plafond, qui ne compresse rien et
 * refuse tout ce qui le dépasse.
 *
 * Le POIDS NE SUFFIT PAS. Un PNG de 40 000 × 40 000 px pèse quelques
 * kilo-octets une fois compressé et ferait exploser la mémoire de tout ce qui
 * le redimensionnerait ensuite. Les dimensions se lisent donc dans l'en-tête,
 * sans décoder l'image ni ajouter de dépendance.
 *
 * Le plafond de poids est descendu de 5 Mo à 1,5 Mo : depuis que le
 * navigateur vise 300 Ko, 5 Mo n'était plus une limite mais une porte
 * ouverte. L'écart 300 Ko / 1,5 Mo laisse passer les scènes que l'encodeur
 * digère mal, sans punir le vendeur. */

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
  if (file.size === 0 || file.size > COVER_MAX_OCTETS) {
    return NextResponse.json(
      {
        error: `Image trop lourde (max ${Math.round(COVER_MAX_OCTETS / 1024)} Ko).`,
        code: "ZB084",
      },
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

  /* Dimensions lues dans l'en-tête. Fail-closed : un format qu'on ne sait pas
   * lire est un format qu'on ne sait pas borner — on refuse plutôt que de
   * laisser entrer une image dont on ignore la taille réelle. */
  const entete = new Uint8Array(await file.slice(0, 64 * 1024).arrayBuffer());
  const dims = dimensionsDepuisEntete(entete);
  if (!dims) {
    return NextResponse.json(
      { error: "Image illisible — envoyez un JPG, PNG ou WebP.", code: "ZB084" },
      { status: 422 }
    );
  }
  if (dims.largeur > COVER_MAX_DIMENSION || dims.hauteur > COVER_MAX_DIMENSION) {
    return NextResponse.json(
      {
        error: `Image trop grande (${dims.largeur}×${dims.hauteur} px, max ${COVER_MAX_DIMENSION}).`,
        code: "ZB084",
      },
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
