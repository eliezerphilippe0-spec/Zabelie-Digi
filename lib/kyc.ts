import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingTable } from "@/lib/product-media";

/**
 * KYC vendeur (docs/35 V-6) — lectures tolérantes et vocabulaire partagé.
 *
 * Dormant sans `0079` : `lireDossierKyc` rend `null` sur table absente, et
 * toute surface se tait. On n'annonce pas une vérification qui n'existe pas.
 */

import { KYC_BUCKET } from "@/lib/storage-buckets";
export { KYC_BUCKET };
/** Arbitrage porteur 2026-08-15 : CIN ou passeport. `selfie` complète la paire. */
export const KYC_TYPES = ["cin", "paspo", "selfie"] as const;
export type KycType = (typeof KYC_TYPES)[number];
export type KycStatut = "pending" | "approved" | "rejected";

/** 5 Mo : une photo de pièce prise au téléphone, pas un scan d'archive. */
export const KYC_MAX_BYTES = 5 * 1024 * 1024;
export const KYC_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "pdf"]);

/**
 * Type enregistré au stockage, déduit de l'extension PAR LE SERVEUR. Celui que
 * le navigateur déclare n'est jamais repris : c'est lui qui décide comment la
 * pièce s'ouvre quand l'administrateur la consulte. Le bucket (0140) n'accepte
 * que ces quatre types.
 */
export const KYC_TYPE_PAR_EXTENSION: Readonly<Record<string, string>> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  pdf: "application/pdf",
};

const commencePar = (octets: Uint8Array, attendu: readonly number[], decalage = 0) =>
  octets.length >= decalage + attendu.length && attendu.every((o, i) => octets[decalage + i] === o);

/**
 * Les premiers octets correspondent-ils à l'extension annoncée ? Lit 12 octets
 * au plus. Un fichier renommé (une page enregistrée en `.pdf`, une image en
 * `.png` qui n'en est pas une) est refusé avant d'atteindre le stockage.
 */
export function signatureKycValide(ext: string, octets: Uint8Array): boolean {
  switch (ext) {
    case "jpg":
    case "jpeg":
      return commencePar(octets, [0xff, 0xd8, 0xff]);
    case "png":
      return commencePar(octets, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case "webp":
      return commencePar(octets, [0x52, 0x49, 0x46, 0x46]) && commencePar(octets, [0x57, 0x45, 0x42, 0x50], 8);
    case "pdf":
      return commencePar(octets, [0x25, 0x50, 0x44, 0x46, 0x2d]);
    default:
      return false;
  }
}

export type DossierKyc = {
  statut: KycStatut;
  documents: { id: string; kind: KycType }[];
  noteAdmin: string | null;
  decidedAt: string | null;
};

export function estTypeKyc(v: unknown): v is KycType {
  return typeof v === "string" && (KYC_TYPES as readonly string[]).includes(v);
}

/**
 * Le dossier du vendeur — métadonnées seulement. Les IMAGES ne sortent
 * jamais par ce chemin : elles vivent dans un bucket sans policy, et seul
 * l'admin en obtient une URL signée à courte durée.
 */
export async function lireDossierKyc(
  supabase: SupabaseClient,
  userId: string
): Promise<DossierKyc | null> {
  const { data: sub, error } = await supabase
    .from("zabelie_kyc_submissions")
    .select("status, note_admin, decided_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    if (!isMissingTable(error)) {
      console.error("[kyc] lecture dossier échouée", error.code);
    }
    return null;
  }
  const { data: docs } = await supabase
    .from("zabelie_kyc_documents")
    .select("id, kind")
    .eq("user_id", userId)
    .order("created_at");
  return {
    statut: (sub?.status as KycStatut) ?? "pending",
    documents: (docs ?? []) as { id: string; kind: KycType }[],
    noteAdmin: sub?.note_admin ?? null,
    decidedAt: sub?.decided_at ?? null,
  };
}

/**
 * Le blocage est-il ARMÉ ? Lu en base — `false` par défaut et sur toute
 * dégradation : une lecture qui échoue ne doit jamais couper un retrait.
 */
export async function kycRequisPourRetrait(
  admin: SupabaseClient
): Promise<boolean> {
  try {
    const { data, error } = await admin
      .from("zabelie_kyc_config")
      .select("requis_pour_retrait")
      .maybeSingle();
    if (error || !data) return false;
    return Boolean(data.requis_pour_retrait);
  } catch {
    return false;
  }
}
