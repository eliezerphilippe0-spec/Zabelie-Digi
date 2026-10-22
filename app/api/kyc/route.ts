import { NextResponse } from "next/server";
import { erreurTraduite } from "@/lib/api-erreur";
import { createClient } from "@/lib/supabase/server";
import { requireActiveAccount } from "@/lib/auth";
import { UUID_RE } from "@/lib/collections";
import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingTable } from "@/lib/product-media";
import { isMissingFunction } from "@/lib/pg-errors";
import {
  KYC_BUCKET,
  KYC_EXTENSIONS,
  KYC_MAX_BYTES,
  KYC_TYPE_PAR_EXTENSION,
  estTypeKyc,
  signatureKycValide,
} from "@/lib/kyc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/kyc (multipart : expectedActorId, kind, file) — dépôt d'UNE pièce.
 *
 * Le fichier va dans un bucket PRIVÉ (0079, aucune policy) : il n'existe
 * aucune URL publique vers une pièce d'identité, à aucun moment. Le chemin
 * est nommé par le serveur ; l'extension du client ne sert qu'à valider le
 * format.
 *
 * Un dossier DÉJÀ APPROUVÉ n'accepte plus de pièce : rouvrir une
 * vérification passée est une décision d'administration, pas un téléversement.
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return erreurTraduite("api.auth.required", 401);
  }
  const accountRefusal = await requireActiveAccount(user.id, { legalAcceptance: true });
  if (accountRefusal) return accountRefusal;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return erreurTraduite("api.form.invalid", 400);
  }
  // L'identité de l'écran est une précondition ; la session reste propriétaire.
  const expectedActorId = form.get("expectedActorId");
  if (typeof expectedActorId !== "string" || !UUID_RE.test(expectedActorId)) {
    return erreurTraduite("api.params.invalid", 422);
  }
  if (expectedActorId !== user.id) {
    return erreurTraduite("api.auth.required", 403);
  }
  const kind = form.get("kind");
  const file = form.get("file");
  if (!estTypeKyc(kind) || !(file instanceof File)) {
    return erreurTraduite("api.kyc.doc.required", 400);
  }
  if (file.size === 0 || file.size > KYC_MAX_BYTES) {
    return erreurTraduite("api.kyc.size", 422);
  }
  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  if (!KYC_EXTENSIONS.has(ext)) {
    return erreurTraduite("api.kyc.format", 422);
  }
  // Le contenu doit être ce que l'extension annonce ; le type enregistré est
  // celui du serveur, jamais celui que le navigateur déclare.
  const entete = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (!signatureKycValide(ext, entete)) {
    return erreurTraduite("api.kyc.format", 422);
  }
  const contentType = KYC_TYPE_PAR_EXTENSION[ext];

  const admin = createAdminClient();

  // Le dossier : créé au premier dépôt, jamais rouvert par cette route.
  const { data: sub, error: subErr } = await admin
    .from("zabelie_kyc_submissions")
    .select("status, submitted_at, decided_at, decided_by")
    .eq("user_id", user.id)
    .maybeSingle();
  if (subErr) {
    if (isMissingTable(subErr)) {
      // Deux destinataires, deux messages. Le VENDEUR lit « fonction non
      // disponible » dans sa langue ; l'identifiant de migration reste au
      // journal, où l'exploitant le lit. Une page publique qui nomme l'état
      // interne du schéma est une fuite gratuite — et un identifiant que
      // PERSONNE ne lit est une observabilité perdue.
      console.error(
        "[kyc] MIGRATION 0079 NON APPLIQUÉE — zabelie_kyc_submissions introuvable :",
        subErr.code
      );
      return erreurTraduite("api.feature.off", 503);
    }
    return erreurTraduite("api.read.failed", 500);
  }
  if (sub?.status === "approved") {
    return erreurTraduite("api.kyc.locked", 409);
  }

  // Chemin SERVEUR, dans un dossier par utilisateur.
  const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
  const { error: upErr } = await admin.storage
    .from(KYC_BUCKET)
    .upload(path, file, { contentType });
  if (upErr) {
    return erreurTraduite("api.upload.failed", 502);
  }

  // The profile lock serializes this transaction with account closure; the
  // snapshot check prevents overwriting a decision made during the upload.
  // The existing document and submission are recorded together (0130).
  let rawResult: unknown = null;
  let registrationError: { code?: string; message?: string } | null = null;
  try {
    const { data, error } = await admin.rpc("zabelie_register_kyc_document", {
      p_user_id: user.id, p_kind: kind, p_storage_path: path, p_expected: sub,
    });
    rawResult = data;
    registrationError = error;
  } catch {
    registrationError = { code: "registration_unavailable" };
  }
  const result = rawResult && typeof rawResult === "object" && !Array.isArray(rawResult)
    ? rawResult as Record<string, unknown> : null;
  const refusalCode = result?.code === "account_inactive" || result?.code === "conflict" || result?.code === "locked"
    ? result.code : null;
  if (registrationError || result?.ok !== true || typeof result.id !== "string" || !result.id || refusalCode) {
    // An absent row cannot prove that an interrupted transaction will not
    // commit later. Only a conclusive refusal before INSERT (0130), or a
    // missing PostgREST RPC entry before dispatch, permits removing the file.
    const refusal = !registrationError && result?.ok === false && result.id === undefined ? refusalCode : null;
    if (refusal || registrationError?.code === "PGRST202") {
      try {
        const { error: removeError } = await admin.storage.from(KYC_BUCKET).remove([path]);
        if (removeError) throw new Error("cleanup_failed");
      } catch {
        console.error("[kyc] upload_cleanup_unavailable");
        return erreurTraduite("api.unavailable", 503);
      }
    }
    if (registrationError && isMissingFunction(registrationError)) {
      console.error("[kyc] MIGRATION 0130 NON APPLIQUÉE — dépôt atomique indisponible");
      return erreurTraduite("api.feature.off", 503);
    }
    if (refusal === "account_inactive") return erreurTraduite("api.suspended", 403);
    if (refusal === "conflict" || refusal === "locked") return erreurTraduite("api.kyc.locked", 409);
    return erreurTraduite("api.write.failed", 503);
  }

  // L'identifiant seul — jamais d'URL : le bucket est privé, par construction.
  return NextResponse.json({ ok: true, id: result.id, kind });
}
