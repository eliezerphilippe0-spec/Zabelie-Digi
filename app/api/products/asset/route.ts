import { isDownloadable } from "@/lib/product-kind";
import { UUID_RE, MAX_DIGITAL_FILES } from "@/lib/digital-studio";
import { getLang } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";
import { rateLimit } from "@/lib/zabelie-rate-limit";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireActiveAccount } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { DIGITAL_BUCKET as BUCKET } from "@/lib/storage-buckets";
import { confirmerLivrable } from "@/lib/product-asset-confirm";

// Liste blanche des livrables numériques (audit sécurité §8.1). Le bucket est
// privé et la livraison force le téléchargement (jamais de rendu navigateur),
// mais on refuse quand même les formats exécutables/sans usage marchand : un
// fichier vendu est un document, un média ou une archive — pas un .exe.
const ALLOWED_EXTENSIONS = new Set([
  // documents & ebooks
  "pdf", "epub", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "csv",
  // audio (beats, samples)
  "mp3", "wav", "ogg", "flac", "aac", "m4a", "mid", "midi",
  // vidéo (formations, templates)
  "mp4", "mov", "webm", "mkv",
  // images & design
  "png", "jpg", "jpeg", "webp", "gif", "psd", "ai", "svg", "fig", "sketch",
  // archives (packs, code source livré zippé)
  "zip", "rar", "7z",
]);

/**
 * POST /api/products/asset  — protocole en DEUX TEMPS (JSON) :
 *   { productId, step: "demande",  fileName }        → { path, token }
 *   { productId, step: "confirme", path, fileName }  → { ok: true }
 *
 * Le client téléverse LUI-MÊME vers le stockage entre les deux, par lien
 * signé. Réservé au vendeur propriétaire. Le bucket est privé : la livraison
 * se fait par URL signée après paiement (`/api/download`).
 *
 * ─── POURQUOI CE N'EST PLUS DU MULTIPART ────────────────────────────────────
 * Cette route acceptait le fichier en `multipart/form-data` et le repostait
 * au stockage depuis la fonction. Elle annonçait **50 Mo** — que la plateforme
 * serverless ne porte pas ; `docs/35` §V1-B l'écrit noir sur blanc et la
 * vidéo avait déjà été construite en deux temps pour cette raison exacte.
 * La contrainte était connue, documentée, appliquée à la galerie — et jamais
 * à ce chemin-ci.
 *
 * Le pire n'est pas l'échec, c'est sa forme : au-delà de la limite, la requête
 * est refusée AVANT que la fonction s'exécute. Aucune ligne de code d'ici ne
 * tourne, donc rien ne journalise, et le vendeur voit un échec sans cause.
 * C'est « l'absence de signal » de CLAUDE.md dans sa version la plus coûteuse :
 * le 2026-08-11 à 01:46, trois créations du même produit en vingt et une
 * secondes, puis l'abandon — et zéro trace de ce qui s'est passé.
 *
 * ⚠️ Le stockage de production était vide de bout en bout à cette date, donc
 * la clé service-role défaillante est une cause suffisante à elle seule pour
 * ces trois-là. Ce défaut-ci est indépendant : il survit à la réparation de la
 * clé, et il n'aurait mordu qu'au premier ebook dépassant quelques mégaoctets.
 * Les deux méritaient d'être dits séparément.
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

  // Compte suspendu (modération) : action bloquée même si la session est
  // encore active (le ban auth ne coupe la session qu'au refresh du token).
  const accountRefusal = await requireActiveAccount(user.id);
  if (accountRefusal) return accountRefusal;

  let body: { productId?: unknown; step?: unknown; path?: unknown; fileName?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: t(lang, "api.json.invalid") }, { status: 400 });
  }

  const productId = typeof body.productId === "string" ? body.productId : "";
  const step = body.step === "demande" || body.step === "confirme" ? body.step : null;
  if (!UUID_RE.test(productId) || !step) {
    return NextResponse.json({ error: t(lang, "api.params.invalid") }, { status: 400 });
  }

  // Nom d'affichage : c'est lui que l'acheteur verra à l'enregistrement. Il ne
  // sert JAMAIS à construire le chemin de stockage — voir plus bas.
  const safeName = String(body.fileName ?? "").replace(/[^a-zA-Z0-9._-]/g, "_");
  const ext = safeName.split(".").pop()?.toLowerCase() ?? "";
  if (!safeName || safeName.length > 200 || !ALLOWED_EXTENSIONS.has(ext)) {
    return NextResponse.json(
      {
        error: t(lang, "api.file.type"),
      },
      { status: 422 }
    );
  }

  const admin = createAdminClient();

  // Propriété du produit.
  const { data: product, error: prodErr } = await admin
    .from("products")
    .select("id, seller_id, kind, status")
    .eq("id", productId)
    .single();
  if (prodErr || !product || product.seller_id !== user.id) {
    return NextResponse.json({ error: t(lang, "api.product.notfound") }, { status: 404 });
  }

  if (!isDownloadable(product.kind) || product.status !== "draft") {
    return NextResponse.json({ error: t(lang, "studio.draftRequired") }, { status: 409 });
  }
  if (!(await rateLimit(admin, `digital-upload:${user.id}`, 30))) return NextResponse.json({ error: t(lang, "studio.error") }, { status: 429 });
  if (step === "demande") {
    const { count, error: countError } = await admin.from("product_assets").select("id", { count: "exact", head: true }).eq("product_id", productId);
    if (countError || (count ?? 0) >= MAX_DIGITAL_FILES) return NextResponse.json({ error: t(lang, "studio.fileLimit") }, { status: 422 });
    /* Chemin SERVEUR, et un UUID plutôt que le nom du fichier.
     *
     * Deux raisons. Le lien signé ne vaut que pour ce chemin précis : un
     * chemin choisi par le client permettrait d'écrire ailleurs que sous son
     * propre produit. Et BL-138 (C-12) disparaît au passage — l'ancien chemin
     * dépendait du NOM, donc un remplacement sous un autre nom laissait un
     * objet orphelin. Deux UUID distincts ne collident jamais, et les anciennes
     * versions restent conservées après la confirmation. */
    const path = `${user.id}/${product.id}/liv-${crypto.randomUUID()}.${ext}`;
    const { data, error } = await admin.storage
      .from(BUCKET)
      .createSignedUploadUrl(path);
    if (error || !data) {
      return NextResponse.json({ error: t(lang, "api.upload.failed") }, { status: 502 });
    }
    return NextResponse.json({ ok: true, path: data.path, token: data.token });
  }

  // ── step === "confirme" : la confirmation partagée avec « Soumettre à la revue » ──
  return confirmerLivrable({ admin, lang, user, product, productId, body, safeName, ext });
}
