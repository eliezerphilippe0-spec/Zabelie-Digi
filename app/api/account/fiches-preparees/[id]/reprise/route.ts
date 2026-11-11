import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireActiveAccount } from "@/lib/auth";
import { getLang } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";
import { lireIdPreparee } from "@/lib/fiche-preparee";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/account/fiches-preparees/{id}/reprise — le vendeur connecté a
 * repris une fiche préparée dans son formulaire (lot 3b, 0171).
 *
 * Marque la fiche comme reprise, ce qui libère une place dans le plafond des
 * vingt en attente. Rien d'autre : aucun produit n'est créé ici, et le contenu
 * d'une fiche ne se modifie pas (trigger `0171`).
 *
 * Cloisonnement : la mise à jour porte `seller_id = <vendeur de la session>`.
 * Une fiche d'autrui, inconnue ou déjà reprise ne touche aucune ligne, et la
 * réponse est la même (`ok`) : la route est idempotente et n'apprend rien sur
 * les fiches des autres.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const lang = await getLang();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: t(lang, "api.auth.required") }, { status: 401 });
  const bloque = await requireActiveAccount(user.id);
  if (bloque) return bloque;

  const id = lireIdPreparee((await params).id);
  if (!id) return NextResponse.json({ error: t(lang, "prepared.missing"), code: "not_found" }, { status: 404 });

  const { error } = await createAdminClient()
    .from("zabelie_fiches_preparees")
    .update({ reprise_at: new Date().toISOString() })
    .eq("id", id)
    .eq("seller_id", user.id)
    .is("reprise_at", null);
  if (error) {
    console.error("[fiches-preparees] reprise non enregistrée", error.code);
    return NextResponse.json({ error: t(lang, "api.unavailable"), code: "unavailable" }, { status: 503 });
  }
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
