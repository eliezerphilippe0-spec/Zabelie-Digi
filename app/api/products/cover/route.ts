import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireActiveAccount } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getLang } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";
import {
  COVER_MAX_OCTETS,
  COVER_MAX_DIMENSION,
  EXTENSION_DU_FORMAT,
  dimensionsDepuisEntete,
  formatDepuisEntete,
} from "@/lib/image-limits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { MEDIA_BUCKET as BUCKET } from "@/lib/storage-buckets";

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
 * digère mal, sans punir le vendeur.
 *
 * Le TYPE stocké se déduit du format lu dans l'en-tête, jamais de ce que le
 * client annonce (revue du 2026-10-08, SEC-02) : l'extension du nom envoyé
 * ne commande plus rien. */

/**
 * POST /api/products/cover  (multipart : productId, file)
 * Photo principale d'un produit — bucket PUBLIC (catalogue, cartes WhatsApp).
 * Réservé au vendeur propriétaire. Écrit products.cover_url.
 */
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

  /* Format et dimensions lus dans l'en-tête. Fail-closed : un format qu'on ne
   * sait pas lire est un format qu'on ne sait ni typer ni borner — on refuse
   * plutôt que de laisser entrer une image dont on ignore la nature ou la
   * taille réelle. Un fichier vide tombe ici aussi. */
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

  const admin = createAdminClient();
  // Propriété : seul le vendeur du produit peut poser sa photo.
  const { data: product } = await admin
    .from("products")
    .select("id, seller_id")
    .eq("id", productId)
    .single();
  if (!product || product.seller_id !== user.id) {
    return NextResponse.json({ error: t(lang, "api.product.notfound") }, { status: 404 });
  }

  // Nom de fichier SERVEUR (pas de path traversal), extension et type
  // déduits du format LU.
  const path = `${product.id}/cover.${EXTENSION_DU_FORMAT[format]}`;
  const { error: upErr } = await admin.storage
    .from(BUCKET)
    .upload(path, file, { upsert: true, contentType: format });
  if (upErr) {
    return NextResponse.json({ error: t(lang, "api.upload.failed") }, { status: 502 });
  }

  const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(path);
  // Cache-buster : upsert garde le même chemin, le CDN servirait l'ancienne.
  const coverUrl = `${pub.publicUrl}?v=${Date.now()}`;

  const { error: updErr } = await admin
    .from("products")
    .update({ cover_url: coverUrl })
    .eq("id", product.id);
  if (updErr) {
    return NextResponse.json({ error: t(lang, "api.write.failed") }, { status: 500 });
  }

  return NextResponse.json({ ok: true, coverUrl });
}
