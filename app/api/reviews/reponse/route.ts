import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/zabelie-rate-limit";
import { UUID_RE } from "@/lib/collections";
import { getLang } from "@/lib/i18n-server";
import { erreurAvecLangue } from "@/lib/api-erreur";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Bornes reprises de 0139 : la base les impose aussi, la route répond plus tôt. */
const REPONSE_MAX = 1000;

/**
 * POST /api/reviews/reponse  { reviewId, texte }
 * Réponse publique du vendeur à un avis (0139 ; audit docs/69, lot 2).
 *
 * ⚠️ CLIENT DE SESSION, JAMAIS LA CLÉ DE SERVICE, pour l'appel métier.
 * `zabelie_repondre_avis` identifie le vendeur par `auth.uid()`. Appelée avec
 * la clé de service, `auth.uid()` vaudrait NULL et la fonction refuserait
 * tout ; c'est le piège documenté de docs/26 §17, et la garde le vérifie.
 * La clé de service ne sert qu'au plafond de débit, comme les autres routes.
 *
 * Toutes les règles (vendeur du produit, compte actif, une seule fois,
 * longueur) vivent dans la fonction. La route ne fait que traduire ses refus.
 */
export async function POST(req: Request) {
  const lang = await getLang();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return erreurAvecLangue(lang, "api.auth.required", 401);
  }

  let body: { reviewId?: unknown; texte?: unknown };
  try {
    body = await req.json();
  } catch {
    return erreurAvecLangue(lang, "api.json.invalid", 400);
  }
  const reviewId = typeof body.reviewId === "string" ? body.reviewId : "";
  const texte = typeof body.texte === "string" ? body.texte.trim() : "";
  if (!UUID_RE.test(reviewId) || texte.length < 1 || texte.length > REPONSE_MAX) {
    return erreurAvecLangue(lang, "api.params.invalid", 400);
  }

  if (!(await rateLimit(createAdminClient(), `avis:reponse:${user.id}`, 20, 3600))) {
    return erreurAvecLangue(lang, "api.rate.limited", 429);
  }

  const { error } = await supabase.rpc("zabelie_repondre_avis", {
    p_review_id: reviewId,
    p_texte: texte,
  });
  if (error) {
    const statut = error.code === "23505" ? 409 : error.code === "42501" ? 403 : error.code === "22023" ? 400 : 500;
    if (statut === 500) console.error("[avis] reponse non enregistree", error.code ?? "sans code");
    const cle = statut === 409 ? "review.reponse.deja" : statut === 403 ? "api.access.denied" : statut === 400 ? "api.params.invalid" : "api.write.failed";
    return erreurAvecLangue(lang, cle, statut);
  }
  return NextResponse.json({ ok: true });
}
