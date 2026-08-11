import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isDownloadable, type ProductKind } from "@/lib/product-kind";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED = ["draft", "published", "archived"] as const;

/**
 * POST /api/admin/product-status  { productId, status }
 * Modération : change le statut d'un produit. Réservé au rôle admin.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  let body: { productId?: string; status?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const { productId, status } = body;
  if (!productId || !status || !ALLOWED.includes(status as (typeof ALLOWED)[number])) {
    return NextResponse.json(
      { error: "productId et status valide requis" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  /* UN FICHIER SANS FICHIER NE SE PUBLIE PAS.
   *
   * Mesuré en production le 2026-08-11 : « cours du créole », `kind = fichier`,
   * `status = published`, ZÉRO livrable. Achetable, donc — et le chemin d'après
   * est écrit dans `0059` : l'acheteur paie, reçoit un 404, et le vendeur est
   * payé à J+7 parce que rien ne regarde de ce côté.
   *
   * Les trois kinds naissent `draft` et passent par cette revue humaine ; elle
   * était le seul endroit où poser la question, et elle ne la posait pas. Le
   * garde est ici plutôt qu'en base parce que c'est ici qu'on peut DIRE à
   * l'admin ce qui manque — un `check` aurait rendu une violation de
   * contrainte, et un vendeur n'en fait rien.
   *
   * `archived` et `draft` passent : on doit toujours pouvoir RETIRER un
   * produit, surtout celui-là. Seule la mise en vente est gardée. */
  if (status === "published") {
    const { data: produit, error: eLecture } = await admin
      .from("products")
      .select("kind")
      .eq("id", productId)
      .maybeSingle();

    if (eLecture || !produit) {
      return NextResponse.json({ error: "Produit introuvable" }, { status: 404 });
    }

    if (isDownloadable(produit.kind as ProductKind, productId)) {
      const { count, error: eAssets } = await admin
        .from("product_assets")
        .select("id", { count: "exact", head: true })
        .eq("product_id", productId);

      // Fail-closed : si on ne SAIT PAS s'il y a un livrable, on ne publie
      // pas. Publier dans le doute met en vente un produit peut-être
      // indélivrable ; refuser dans le doute fait patienter un admin.
      if (eAssets) {
        return NextResponse.json(
          { error: "Vérification du livrable impossible — réessayez" },
          { status: 503 }
        );
      }
      if ((count ?? 0) === 0) {
        return NextResponse.json(
          {
            error:
              "Ce produit est un fichier et n'a aucun livrable téléversé. " +
              "Publier reviendrait à le mettre en vente sans rien à remettre.",
            code: "livrable_manquant",
          },
          { status: 422 }
        );
      }
    }
  }

  const { error } = await admin
    .from("products")
    .update({ status })
    .eq("id", productId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, status });
}
