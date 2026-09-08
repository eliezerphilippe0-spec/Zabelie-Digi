"use server";

import { getCurrentUser } from "@/lib/auth";
import { readAdminSession } from "@/lib/admin-session";
import { createClient } from "@/lib/supabase/server";

const FACTOR_NAME = "Zabelie administration";

/** AAL1 autorisé uniquement pour configurer/challenger SON facteur.
 * Les Server Actions imposent POST et la vérification Origin de Next.js.
 * Aucun secret ni code n'est journalisé ou placé dans une URL.
 */
export async function enrollAdminMfa() {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "admin") return { error: true } as const;
    const client = await createClient();
    const factors = await client.auth.mfa.listFactors();
    if (factors.error || factors.data.all.some((f) => f.status === "verified")) {
      return { error: true } as const;
    }
    // Reprendre une configuration abandonnée sans toucher aux facteurs actifs.
    for (const factor of factors.data.all) {
      if (factor.status === "unverified" && factor.factor_type === "totp" && factor.friendly_name === FACTOR_NAME) {
        const removed = await client.auth.mfa.unenroll({ factorId: factor.id });
        if (removed.error) return { error: true } as const;
      }
    }
    const result = await client.auth.mfa.enroll({ factorType: "totp", friendlyName: FACTOR_NAME, issuer: "Zabelie" });
    if (result.error) return { error: true } as const;
    return { error: false, factorId: result.data.id, qr: result.data.totp.qr_code, secret: result.data.totp.secret } as const;
  } catch {
    return { error: true } as const;
  }
}

export async function verifyAdminMfa(factorId: string, code: string) {
  if (typeof factorId !== "string" || !/^[0-9a-f-]{36}$/i.test(factorId) || typeof code !== "string" || !/^\d{6}$/.test(code)) {
    return { error: true } as const;
  }
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "admin") return { error: true } as const;
    const client = await createClient();
    const factors = await client.auth.mfa.listFactors();
    if (factors.error) return { error: true } as const;
    const factor = factors.data.all.find((f) => f.id === factorId && f.factor_type === "totp");
    if (!factor) return { error: true } as const;
    // Un facteur neuf ne peut servir à contourner un facteur déjà actif.
    if (factor.status !== "verified" && factors.data.all.some((f) => f.status === "verified")) return { error: true } as const;
    const result = await client.auth.mfa.challengeAndVerify({ factorId, code });
    if (result.error || !(await readAdminSession(client))) return { error: true } as const;
    return { error: false } as const;
  } catch {
    return { error: true } as const;
  }
}
