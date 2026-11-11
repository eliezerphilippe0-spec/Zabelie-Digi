import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getLang } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * DELETE /api/account/api-keys/[id] — révoque une clé du vendeur connecté.
 *
 * Révoquer, c'est DATER (`revoked_at`), jamais supprimer : la trace d'usage
 * reste. Le filtre `seller_id = user.id` est dans la MÊME requête que la
 * mise à jour — un identifiant d'une autre boutique rend 404, pas 403, pour
 * ne pas confirmer qu'il existe. Ouvert aux comptes suspendus : couper une
 * clé doit toujours rester possible.
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const lang = await getLang();
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: t(lang, "api.auth.required") }, { status: 401 });
  if (!UUID.test(id)) return NextResponse.json({ error: t(lang, "apikeys.err.notfound"), code: "not_found" }, { status: 404 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("zabelie_api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .eq("seller_id", user.id)
    .is("revoked_at", null)
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("[api-keys] révocation refusée", error.code, error.message);
    return NextResponse.json({ error: t(lang, "api.unavailable"), code: "unavailable" }, { status: 503 });
  }
  if (!data) return NextResponse.json({ error: t(lang, "apikeys.err.notfound"), code: "not_found" }, { status: 404 });

  /* Les fiches préparées que CETTE clé a déposées et que le vendeur n'a pas
   * reprises partent avec elle (0171). Une clé qui a fui peut en avoir déposé
   * vingt : sans ce ménage, elles bloqueraient les dépôts du vendeur pendant
   * sept jours après la révocation. Celles qu'il a déjà reprises restent.
   * Non bloquant : la clé EST révoquée, et un échec ici ne doit pas faire
   * croire le contraire. */
  const { error: menage } = await admin
    .from("zabelie_fiches_preparees")
    .delete()
    .eq("api_key_id", id)
    .eq("seller_id", user.id)
    .is("reprise_at", null);
  if (menage) console.error("[api-keys] fiches préparées de la clé révoquée non supprimées", menage.code);
  return NextResponse.json({ ok: true });
}
