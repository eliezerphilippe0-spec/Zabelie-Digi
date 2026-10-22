import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireActiveAccount } from "@/lib/auth";
import { rateLimit } from "@/lib/zabelie-rate-limit";
import { getLang } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";
import { erreurAvecLangue } from "@/lib/api-erreur";
import { essayageActif, lireEnvEssayage } from "@/lib/essayage/flags";
import { lireFournisseur } from "@/lib/essayage/fournisseur";
import { baseEssayage } from "@/lib/essayage/base";
import { POIDS_MAX_PHOTO, demarrerEssai } from "@/lib/essayage/serveur";
import { ENTETES_ESSAYAGE, reponseDemarrage } from "@/lib/essayage/reponses";
import type { TypePhoto } from "@/lib/essayage/fournisseurs/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/essayage  (multipart : produit, photo)
 *
 * Essayage virtuel (docs/74 §3, tâche 4.2). L'acheteur vient de la SESSION,
 * jamais du formulaire. La photo est lue en mémoire, passe au fournisseur, et
 * n'est écrite nulle part : ni Storage, ni base, ni journal.
 *
 * Deux limites de débit, parce qu'un échec ne compte pas dans le quota du
 * jour : sans la limite journalière, des photos refusées en boucle feraient
 * travailler le fournisseur sans fin.
 */
export async function POST(req: Request) {
  const lang = await getLang();
  const env = lireEnvEssayage();
  if (!essayageActif(env)) return erreurAvecLangue(lang, "api.feature.off", 404);
  const fournisseur = lireFournisseur(env);
  if (!fournisseur) return erreurAvecLangue(lang, "api.feature.off", 404);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return erreurAvecLangue(lang, "api.auth.required", 401);
  const refus = await requireActiveAccount(user.id, { legalAcceptance: true });
  if (refus) return refus;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return erreurAvecLangue(lang, "api.form.invalid", 400);
  }
  const produit = form.get("produit");
  const photo = form.get("photo");
  if (typeof produit !== "string" || !(photo instanceof File)) return erreurAvecLangue(lang, "api.params.invalid", 400);
  // Refusée avant d'être lue : le poids annoncé suffit.
  if (photo.size > POIDS_MAX_PHOTO) return erreurAvecLangue(lang, "essayage.refus.photo", 422, { code: "photo" });

  const admin = createAdminClient();
  if (!(await rateLimit(admin, `essayage:minute:${user.id}`, 6, 60)) || !(await rateLimit(admin, `essayage:jour:${user.id}`, 20, 86_400))) {
    return erreurAvecLangue(lang, "api.rate.limited", 429);
  }

  let r;
  try {
    r = reponseDemarrage(
      await demarrerEssai(
        { base: baseEssayage(admin), fournisseur },
        { acheteurId: user.id, produitId: produit, photo: { octets: new Uint8Array(await photo.arrayBuffer()), type: photo.type as TypePhoto } },
      ),
    );
  } catch {
    console.error("[essayage] demarrage interrompu");
    return erreurAvecLangue(lang, "api.unavailable", 503);
  }
  return NextResponse.json(r.cle ? { error: t(lang, r.cle), ...r.corps } : r.corps, { status: r.statut, headers: ENTETES_ESSAYAGE });
}
