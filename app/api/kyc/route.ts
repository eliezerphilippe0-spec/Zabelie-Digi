import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSuspension } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingTable } from "@/lib/product-media";
import {
  KYC_BUCKET,
  KYC_EXTENSIONS,
  KYC_MAX_BYTES,
  estTypeKyc,
} from "@/lib/kyc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/kyc  (multipart : kind, file) — le vendeur dépose UNE pièce.
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
  const kind = form.get("kind");
  const file = form.get("file");
  if (!estTypeKyc(kind) || !(file instanceof File)) {
    return NextResponse.json(
      { error: "Type de pièce et fichier requis (CIN, passeport ou selfie)." },
      { status: 400 }
    );
  }
  if (file.size === 0 || file.size > KYC_MAX_BYTES) {
    return NextResponse.json(
      { error: "Fichier entre 1 octet et 5 Mo requis." },
      { status: 422 }
    );
  }
  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  if (!KYC_EXTENSIONS.has(ext)) {
    return NextResponse.json(
      { error: "Formats acceptés : JPG, PNG, WebP, PDF." },
      { status: 422 }
    );
  }

  const admin = createAdminClient();

  // Le dossier : créé au premier dépôt, jamais rouvert par cette route.
  const { data: sub, error: subErr } = await admin
    .from("zabelie_kyc_submissions")
    .select("status")
    .eq("user_id", user.id)
    .maybeSingle();
  if (subErr) {
    if (isMissingTable(subErr)) {
      return NextResponse.json(
        { error: "Vérification non activée (0079 à appliquer)." },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: "Lecture du dossier échouée" }, { status: 500 });
  }
  if (sub?.status === "approved") {
    return NextResponse.json(
      { error: "Dossier déjà vérifié — contactez le support pour le modifier." },
      { status: 409 }
    );
  }

  // Chemin SERVEUR, dans un dossier par utilisateur.
  const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
  const { error: upErr } = await admin.storage
    .from(KYC_BUCKET)
    .upload(path, file, { contentType: file.type || undefined });
  if (upErr) {
    return NextResponse.json({ error: "Envoi échoué" }, { status: 502 });
  }

  const { data: ligne, error: insErr } = await admin
    .from("zabelie_kyc_documents")
    .insert({ user_id: user.id, kind, storage_path: path })
    .select("id")
    .single();
  if (insErr || !ligne) {
    // Une pièce d'identité orpheline au stockage est un défaut de rétention,
    // pas un simple déchet : on nettoie avant d'échouer.
    await admin.storage.from(KYC_BUCKET).remove([path]);
    return NextResponse.json({ error: "Enregistrement échoué" }, { status: 500 });
  }

  // Le dépôt (re)met le dossier en attente de décision.
  const { error: upsertErr } = await admin.from("zabelie_kyc_submissions").upsert(
    {
      user_id: user.id,
      status: "pending",
      submitted_at: new Date().toISOString(),
      decided_at: null,
      decided_by: null,
    },
    { onConflict: "user_id" }
  );
  if (upsertErr) {
    return NextResponse.json({ error: "Enregistrement échoué" }, { status: 500 });
  }

  // L'identifiant seul — jamais d'URL : le bucket est privé, par construction.
  return NextResponse.json({ ok: true, id: ligne.id, kind });
}
