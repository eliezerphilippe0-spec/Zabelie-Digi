import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireActiveAccount } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getLang } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";
import { rateLimit } from "@/lib/zabelie-rate-limit";
import { logSellerFunnel } from "@/lib/metrics";
import {
  COVER_MAX_DIMENSION,
  COVER_MAX_OCTETS,
  EXTENSION_DU_FORMAT,
  dimensionsDepuisEntete,
  formatDepuisEntete,
} from "@/lib/image-limits";
import {
  MAX_IMAGES_PER_PRODUCT,
  MEDIA_BUCKET,
  isMissingTable,
  revisionMediasDisponible,
} from "@/lib/product-media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ─── LES PLAFONDS DE LA COUVERTURE, ET LE CONTENU LU ──────────────────────
 * Cette route annonçait 5 Mo pendant que le bucket `product-covers` refusait
 * tout ce qui dépasse 1,5 Mo : une photo de téléphone passait le contrôle,
 * puis tombait au stockage sur « Envoi de l'image échoué », sans que le
 * vendeur sache pourquoi (revue du 2026-10-08, UX-01). Les bornes viennent
 * désormais de `lib/image-limits.ts`, les mêmes que la photo principale, et
 * le navigateur compresse avant l'envoi (`GalerieManager`).
 *
 * Le contenu se LIT dans l'en-tête : format et dimensions. Le type stocké et
 * l'extension se déduisent du format réel, jamais de ce que le client
 * annonce — un fichier nommé `.png` pouvait contenir n'importe quoi, et
 * partait au bucket PUBLIC avec le type choisi par l'appelant (SEC-02). */

/**
 * Galerie produit (V-1A, docs/35).
 *   POST   (multipart : productId, file)  — ajoute UNE photo (≤ 6/produit).
 *   DELETE { productId, mediaId }         — retire une photo ou vidéo de la fiche.
 *
 * Réservé au vendeur propriétaire, compte actif. Le plafond est REDIT en base
 * (ZB073) : la vérification app-side seule se contournerait par appels
 * concurrents.
 * ⚠️ Aucune vidéo par cette route — elle passe par un lien signé
 * (`/api/products/media/video` : une route serverless plafonne son corps bien
 * en dessous d'une vidéo).
 */
async function verifierProprietaire(
  admin: SupabaseClient,
  userId: string,
  productId: string
) {
  const { data: product } = await admin
    .from("products")
    .select("id, seller_id, status")
    .eq("id", productId)
    .single();
  if (!product || product.seller_id !== userId) return null;
  return product;
}

export async function POST(req: Request) {
  const lang = await getLang();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: t(lang, "api.auth.required") }, { status: 401 });
  }
  const accountRefusal = await requireActiveAccount(user.id);
  if (accountRefusal) return accountRefusal;

  const admin = createAdminClient();
  // Cadence bornée comme les autres envois vendeur (revue 2026-10-08, SEC-05).
  if (!(await rateLimit(admin, `galerie:${user.id}`, 20))) {
    return NextResponse.json({ error: t(lang, "api.rate.limited") }, { status: 429 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: t(lang, "api.form.invalid") }, { status: 400 });
  }
  const productId = form.get("productId");
  const file = form.get("file");
  if (typeof productId !== "string" || !(file instanceof File)) {
    return NextResponse.json({ error: t(lang, "api.params.invalid") }, { status: 400 });
  }
  if (file.size > COVER_MAX_OCTETS) {
    return NextResponse.json(
      {
        error: t(lang, "api.image.heavy", { max: String(Math.round(COVER_MAX_OCTETS / 1024)) }),
        code: "ZB084",
      },
      { status: 422 }
    );
  }

  /* Fail-closed : un contenu qu'on ne reconnaît pas est un contenu qu'on ne
   * sait ni typer ni borner. Un fichier vide tombe ici aussi. */
  const entete = new Uint8Array(await file.slice(0, 64 * 1024).arrayBuffer());
  const format = formatDepuisEntete(entete);
  if (!format) {
    return NextResponse.json(
      { error: t(lang, "api.image.unreadable"), code: "ZB084" },
      { status: 422 }
    );
  }
  const dims = dimensionsDepuisEntete(entete);
  if (!dims) {
    return NextResponse.json(
      { error: t(lang, "api.image.unreadable"), code: "ZB084" },
      { status: 422 }
    );
  }
  if (dims.largeur > COVER_MAX_DIMENSION || dims.hauteur > COVER_MAX_DIMENSION) {
    return NextResponse.json(
      {
        error: t(lang, "api.image.dimensions", {
          largeur: String(dims.largeur),
          hauteur: String(dims.hauteur),
          max: String(COVER_MAX_DIMENSION),
        }),
        code: "ZB084",
      },
      { status: 422 }
    );
  }

  const product = await verifierProprietaire(admin, user.id, productId);
  if (!product) {
    return NextResponse.json({ error: t(lang, "api.product.notfound") }, { status: 404 });
  }
  if (product.status === "archived") {
    return NextResponse.json({ error: t(lang, "api.status.invalid") }, { status: 409 });
  }
  if (!["draft", "published"].includes(product.status) || !(await revisionMediasDisponible(admin))) {
    return NextResponse.json({ error: t(lang, "api.unavailable") }, { status: 503 });
  }

  // Plafond lisible AVANT l'upload (le trigger ZB073 reste le juge de paix).
  const { count, error: countErr } = await admin
    .from("zabelie_product_media")
    .select("id", { count: "exact", head: true })
    .eq("product_id", product.id)
    .eq("kind", "image");
  if (countErr) {
    if (isMissingTable(countErr)) {
      // L'identifiant de migration va au journal, pas au vendeur.
      console.error("[media] zabelie_product_media absente (0073)");
      return NextResponse.json({ error: t(lang, "api.unavailable") }, { status: 503 });
    }
    return NextResponse.json({ error: t(lang, "api.read.failed") }, { status: 500 });
  }
  if ((count ?? 0) >= MAX_IMAGES_PER_PRODUCT) {
    return NextResponse.json(
      { error: t(lang, "api.gallery.full", { max: String(MAX_IMAGES_PER_PRODUCT) }) },
      { status: 422 }
    );
  }

  // Nom de fichier SERVEUR (pas de path traversal), extension et type déduits
  // du format LU.
  const path = `${product.id}/galerie/${crypto.randomUUID()}.${EXTENSION_DU_FORMAT[format]}`;
  const { error: upErr } = await admin.storage
    .from(MEDIA_BUCKET)
    .upload(path, file, { contentType: format });
  if (upErr) {
    // L'échec de stockage ne doit PAS être muet : un bucket absent ou une clé
    // service-role fausse bloque la photo de tous les vendeurs, et sans ce
    // journal l'équipe n'a aucun signal (audit REA 2026-10-26, #3 ; le défaut
    // de chemin vendeur non instrumenté décrit dans lib/storage-buckets.ts).
    // Bucket + message Supabase seulement — aucune donnée personnelle.
    console.error(`[media] upload storage échoué (bucket ${MEDIA_BUCKET}): ${upErr.message}`);
    logSellerFunnel("gallery_upload", { ok: false, reason: "storage_502" });
    return NextResponse.json({ error: t(lang, "api.upload.failed") }, { status: 502 });
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
    // Une réponse perdue peut suivre le COMMIT : l'objet est alors référencé.
    // Comme pour les livrables numériques, conserver l'objet après une
    // tentative d'insertion ; un nettoyage doit prouver l'absence de référence.
    logSellerFunnel("gallery_upload", { ok: false, reason: "write_500" });
    return NextResponse.json({ error: t(lang, "api.write.failed") }, { status: 500 });
  }

  logSellerFunnel("gallery_upload", { ok: true });
  const { data: pub } = admin.storage.from(MEDIA_BUCKET).getPublicUrl(path);
  return NextResponse.json({ ok: true, id: ligne.id, url: pub.publicUrl, status: "draft" });
}

export async function DELETE(req: Request) {
  const lang = await getLang();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: t(lang, "api.auth.required") }, { status: 401 });
  }
  // Un compte suspendu ne retouche plus ses fiches, retrait compris (SEC-05).
  const accountRefusal = await requireActiveAccount(user.id);
  if (accountRefusal) return accountRefusal;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: t(lang, "api.json.invalid") }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body) ||
    !("productId" in body) || typeof body.productId !== "string" || !body.productId ||
    !("mediaId" in body) || typeof body.mediaId !== "string" || !body.mediaId) {
    return NextResponse.json({ error: t(lang, "api.params.invalid") }, { status: 400 });
  }

  const admin = createAdminClient();
  const product = await verifierProprietaire(admin, user.id, body.productId);
  if (!product) {
    return NextResponse.json({ error: t(lang, "api.product.notfound") }, { status: 404 });
  }
  if (product.status === "archived") {
    return NextResponse.json({ error: t(lang, "api.status.invalid") }, { status: 409 });
  }
  if (!["draft", "published"].includes(product.status) || !(await revisionMediasDisponible(admin))) {
    return NextResponse.json({ error: t(lang, "api.unavailable") }, { status: 503 });
  }

  // Seule la référence de cette fiche peut être retirée.
  const { data: media, error: readErr } = await admin
    .from("zabelie_product_media")
    .select("id, kind, storage_path")
    .eq("id", body.mediaId)
    .eq("product_id", product.id)
    .single();
  if (readErr || !media) {
    return NextResponse.json({ error: t(lang, "api.media.notfound") }, { status: 404 });
  }

  const { data: deleted, error: delErr } = await admin
    .from("zabelie_product_media")
    .delete()
    .eq("id", media.id)
    .eq("product_id", product.id)
    .select("id")
    .maybeSingle();
  if (delErr || !deleted || deleted.id !== media.id) {
    return NextResponse.json({ error: t(lang, "api.delete.failed") }, { status: 500 });
  }
  // Une ancienne confirmation vidéo peut réattacher ce chemin après DELETE.
  // Le conserver : même une relecture d'absence laisserait cette course ouverte.
  // Un nettoyage ultérieur doit aussi exclure les confirmations encore possibles.

  return NextResponse.json({ ok: true, status: "draft" });
}
