import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSuspension } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  MAX_VIDEO_BYTES,
  MEDIA_BUCKET,
  cheminVideoValide,
  isMissingTable,
} from "@/lib/product-media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Vidéo produit (V-1B, docs/35 — arbitrages porteur : 60 s, 50 Mo).
 *
 * DEUX TEMPS, parce qu'une route serverless plafonne son corps bien en
 * dessous d'une vidéo — le fichier va au stockage DIRECTEMENT, par lien
 * signé :
 *   POST { productId, step: "demande", ext }      → { path, token }
 *   POST { productId, step: "confirme", path }    → vérifie l'objet
 *        (existence, taille ≤ 50 Mo, type vidéo) PUIS inscrit la ligne.
 *
 * Le poids est vérifié CÔTÉ SERVEUR sur l'objet réellement téléversé — un
 * client menteur perd son objet (supprimé) et sa ligne (jamais écrite). La
 * durée (60 s) se vérifie côté client avant l'envoi : le serveur ne parse
 * pas les conteneurs vidéo, et la borne DURE reste le poids. ZB073 (base)
 * redit le plafond d'UNE vidéo par produit.
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

  let body: { productId?: string; step?: string; ext?: string; path?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }
  if (!body.productId) {
    return NextResponse.json({ error: "productId requis" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: product } = await admin
    .from("products")
    .select("id, seller_id")
    .eq("id", body.productId)
    .single();
  if (!product || product.seller_id !== user.id) {
    return NextResponse.json({ error: "Produit introuvable" }, { status: 404 });
  }

  // Une seule vidéo par produit (redit en base par ZB073).
  const { count, error: countErr } = await admin
    .from("zabelie_product_media")
    .select("id", { count: "exact", head: true })
    .eq("product_id", product.id)
    .eq("kind", "video");
  if (countErr) {
    if (isMissingTable(countErr)) {
      return NextResponse.json(
        { error: "Galerie non activée (0073 à appliquer)." },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: "Lecture de la galerie échouée" }, { status: 500 });
  }
  if ((count ?? 0) >= 1) {
    return NextResponse.json(
      { error: "Une seule vidéo par produit — retirez l'actuelle d'abord." },
      { status: 422 }
    );
  }

  if (body.step === "demande") {
    const ext = body.ext === "webm" ? "webm" : "mp4";
    // Nom SERVEUR — le lien signé ne vaut que pour ce chemin précis.
    const path = `${product.id}/galerie/vid-${crypto.randomUUID()}.${ext}`;
    const { data, error } = await admin.storage
      .from(MEDIA_BUCKET)
      .createSignedUploadUrl(path);
    if (error || !data) {
      return NextResponse.json({ error: "Lien d'envoi indisponible" }, { status: 502 });
    }
    return NextResponse.json({ ok: true, path: data.path, token: data.token });
  }

  if (body.step === "confirme") {
    const path = String(body.path ?? "");
    if (!cheminVideoValide(product.id, path)) {
      return NextResponse.json({ error: "Chemin invalide" }, { status: 400 });
    }
    // L'objet RÉELLEMENT téléversé : existence, taille, type.
    const dossier = path.slice(0, path.lastIndexOf("/"));
    const nom = path.slice(path.lastIndexOf("/") + 1);
    const { data: objets, error: listErr } = await admin.storage
      .from(MEDIA_BUCKET)
      .list(dossier, { search: nom });
    const objet = (objets ?? []).find((o) => o.name === nom);
    if (listErr || !objet) {
      return NextResponse.json({ error: "Vidéo introuvable au stockage" }, { status: 404 });
    }
    const meta = (objet.metadata ?? {}) as { size?: number; mimetype?: string };
    const taille = Number(meta.size ?? 0);
    const type = String(meta.mimetype ?? "");
    if (taille <= 0 || taille > MAX_VIDEO_BYTES || !type.startsWith("video/")) {
      // Un client menteur perd son objet — jamais de ligne pour un fichier
      // hors contrat.
      await admin.storage.from(MEDIA_BUCKET).remove([path]);
      return NextResponse.json(
        { error: "Vidéo refusée : 50 Mo maximum, format vidéo requis." },
        { status: 422 }
      );
    }

    const { data: ligne, error: insErr } = await admin
      .from("zabelie_product_media")
      .insert({ product_id: product.id, kind: "video", storage_path: path })
      .select("id")
      .single();
    if (insErr || !ligne) {
      await admin.storage.from(MEDIA_BUCKET).remove([path]);
      return NextResponse.json({ error: "Enregistrement échoué" }, { status: 500 });
    }
    const { data: pub } = admin.storage.from(MEDIA_BUCKET).getPublicUrl(path);
    return NextResponse.json({ ok: true, id: ligne.id, url: pub.publicUrl });
  }

  return NextResponse.json({ error: "step inconnu" }, { status: 400 });
}
