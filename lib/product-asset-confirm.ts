import { NextResponse } from "next/server";
import { t, type Lang } from "@/lib/i18n";
import type { createAdminClient } from "@/lib/supabase/admin";
import { DIGITAL_BUCKET as BUCKET } from "@/lib/storage-buckets";

/** Taille maximale d'un livrable, lue sur l'objet réellement écrit. */
export const MAX_BYTES = 50 * 1024 * 1024; // 50 Mo

/**
 * LA CONFIRMATION D'UN LIVRABLE DÉPOSÉ, partagée (Studio, tâche 5.1 de
 * tasks/todo.md). Sortie telle quelle de l'étape « confirme » de
 * `app/api/products/asset/route.ts`, qui l'appelle désormais, pour que
 * « Soumettre à la revue » (5.2) inscrive le PDF du Studio par EXACTEMENT les
 * mêmes règles : chemin attendu sous le produit du vendeur, objet RÉELLEMENT
 * présent au stockage, taille lue dans ses métadonnées (jamais annoncée),
 * objet hors contrat supprimé, aucune ligne en double, et un objet conservé
 * sur un échec ambigu.
 *
 * L'appelant a déjà vérifié la session, le compte actif, la propriété du
 * produit, son état de brouillon et la cadence. Rend toujours la réponse de
 * la route : `ok: true` et le nom du fichier, ou le refus.
 */
export async function confirmerLivrable({
  admin,
  lang,
  user,
  product,
  productId,
  body,
  safeName,
  ext,
}: {
  admin: ReturnType<typeof createAdminClient>;
  lang: Lang;
  user: { id: string };
  product: { id: string };
  productId: string;
  body: { path?: unknown };
  safeName: string;
  ext: string;
}): Promise<NextResponse> {
  const path = String(body.path ?? "");
  const attendu = new RegExp(
    `^${user.id}/${product.id}/liv-[0-9a-fA-F-]{36}\\.${ext}$`
  );
  if (!attendu.test(path)) {
    return NextResponse.json({ error: "Chemin invalide" }, { status: 400 });
  }

  /* L'objet RÉELLEMENT téléversé — jamais la taille annoncée par le client.
   * C'est le seul endroit où la taille peut être vérifiée : à la demande, le
   * fichier n'est pas encore parti. */
  const dossier = path.slice(0, path.lastIndexOf("/"));
  const nom = path.slice(path.lastIndexOf("/") + 1);
  const { data: objets, error: listErr } = await admin.storage
    .from(BUCKET)
    .list(dossier, { search: nom });
  const objet = (objets ?? []).find((o) => o.name === nom);
  if (listErr || !objet) {
    return NextResponse.json(
      { error: "Fichier introuvable au stockage" },
      { status: 404 }
    );
  }
  const taille = Number((objet.metadata as { size?: number } | null)?.size ?? 0);
  if (taille <= 0 || taille > MAX_BYTES) {
    // Un client menteur perd son objet — jamais de ligne pour un fichier hors
    // contrat, et jamais de livrable à zéro octet vendu comme un ebook.
    await admin.storage.from(BUCKET).remove([path]);
    return NextResponse.json(
      { error: "Fichier refusé : 50 Mo maximum, et non vide." },
      { status: 422 }
    );
  }

  const { data: existing } = await admin.from("product_assets").select("id").eq("storage_path", path).maybeSingle();
  if (existing) return NextResponse.json({ ok: true, file_name: safeName });
  const { error: insErr } = await admin.from("product_assets").insert({
    product_id: productId, storage_path: path, file_name: safeName, size_bytes: taille,
  });
  if (insErr && insErr.code !== "23505") {
    // Preserve objects on ambiguous/concurrent confirmation failures. A cleanup
    // must prove the object is absent from every draft AND immutable release.
    return NextResponse.json({ error: t(lang, "studio.error") }, { status: 409 });
  }
  return NextResponse.json({ ok: true, file_name: safeName });
}
