import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getLang } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";
import { lireIdPreparee } from "@/lib/fiche-preparee";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * DELETE /api/account/fiches-preparees/{id} — le vendeur connecté supprime une
 * fiche préparée par un assistant (lot 3b, 0171).
 *
 * Pourquoi cette route existe : sans elle, vingt fiches oubliées (un assistant
 * qui relance, une clé qui a fui) bloquaient tout dépôt pendant sept jours,
 * sans rien que le vendeur puisse faire. Supprimer libère la place.
 *
 * Cloisonnement : `seller_id = <vendeur de la session>` est dans la MÊME
 * requête que la suppression. Une fiche d'autrui rend 404, comme une fiche
 * inconnue, pour ne pas confirmer qu'elle existe. Ouverte aux comptes
 * suspendus, comme la révocation d'une clé : retirer doit rester possible.
 * Aucun produit n'est touché : une fiche préparée n'en est pas un.
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const lang = await getLang();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: t(lang, "api.auth.required") }, { status: 401 });

  const id = lireIdPreparee((await params).id);
  if (!id) return NextResponse.json({ error: t(lang, "prepared.missing"), code: "not_found" }, { status: 404 });

  const { data, error } = await createAdminClient()
    .from("zabelie_fiches_preparees")
    .delete()
    .eq("id", id)
    .eq("seller_id", user.id)
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("[fiches-preparees] suppression refusée", error.code);
    return NextResponse.json({ error: t(lang, "api.unavailable"), code: "unavailable" }, { status: 503 });
  }
  if (!data) return NextResponse.json({ error: t(lang, "prepared.missing"), code: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
