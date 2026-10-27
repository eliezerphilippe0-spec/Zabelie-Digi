import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getLang } from "@/lib/i18n-server";
import { erreurAvecLangue } from "@/lib/api-erreur";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/zelle/reference  { orderId, reference? }
 * L'acheteur signale avoir envoyé son virement Zelle (référence optionnelle).
 * DÉCLARATIF UNIQUEMENT : aucun statut ne change ici — la confirmation reste
 * administrative (/api/admin/confirm-zelle → confirm_payment).
 *
 * ⚠️ QUI LIT CES ERREURS : un acheteur de la diaspora qui a DÉJÀ envoyé ses
 * dollars. Jusqu'à l'audit du 2026-10-27, un échec d'écriture lui rendait le
 * message brut de Postgres, et les autres refus étaient en français pour un
 * lecteur kreyòl, anglais ou espagnol. Chaque refus porte donc :
 *   • un `code` stable, que l'écran n'a pas à traduire ;
 *   • une phrase dans SA langue (`erreurAvecLangue`), qui dit quoi faire ;
 *   • jamais `error.message` — le journal serveur garde le CODE Postgres,
 *     aucune référence bancaire ni identifiant d'acheteur.
 */
export async function POST(req: Request) {
  const lang = await getLang();
  let body: { orderId?: unknown; reference?: unknown };
  try {
    body = await req.json();
  } catch {
    return erreurAvecLangue(lang, "api.json.invalid", 400, { code: "json_invalide" });
  }
  if (!body || typeof body !== "object" || typeof body.orderId !== "string" || !body.orderId) {
    return erreurAvecLangue(lang, "api.params.invalid", 400, { code: "commande_requise" });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return erreurAvecLangue(lang, "api.auth.required", 401, { code: "session_requise" });
  }

  const admin = createAdminClient();
  const { data: payment, error: lectureErr } = await admin
    .from("payments")
    .select("id, rail, status, raw, orders!inner(buyer_id)")
    .eq("order_id", body.orderId)
    .single();

  // `.single()` rend PGRST116 quand aucune ligne ne correspond : c'est
  // « introuvable ». Toute AUTRE erreur est une lecture ratée, et dire
  // « paiement introuvable » à quelqu'un qui vient de payer serait faux.
  if (lectureErr && lectureErr.code !== "PGRST116") {
    console.error("[zelle/reference] lecture du paiement impossible", lectureErr.code);
    return erreurAvecLangue(lang, "api.unavailable", 503, { code: "indisponible" });
  }

  const rawOrder = payment?.orders as unknown;
  const order = (Array.isArray(rawOrder) ? rawOrder[0] : rawOrder) as
    | { buyer_id: string }
    | null;
  if (!payment || payment.rail !== "zelle" || order?.buyer_id !== user.id) {
    return erreurAvecLangue(lang, "zelle.err.introuvable", 404, { code: "paiement_introuvable" });
  }
  if (payment.status !== "pending") {
    return erreurAvecLangue(lang, "zelle.err.dejaTraite", 409, { code: "deja_traite" });
  }

  const reference =
    typeof body.reference === "string" ? body.reference.slice(0, 64) : null;
  const raw = (payment.raw ?? {}) as Record<string, unknown>;
  const { error } = await admin
    .from("payments")
    .update({
      raw: { ...raw, buyer_ref: reference ?? "", buyer_ref_at: new Date().toISOString() },
    })
    .eq("id", payment.id);

  if (error) {
    console.error("[zelle/reference] signalement non enregistré", error.code);
    return erreurAvecLangue(lang, "zelle.err.enregistrement", 500, { code: "enregistrement_impossible" });
  }
  return NextResponse.json({ ok: true });
}
