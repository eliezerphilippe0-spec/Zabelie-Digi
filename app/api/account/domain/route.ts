import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireActiveAccount } from "@/lib/auth";
import { getLang } from "@/lib/i18n-server";
import { t, type I18nKey } from "@/lib/i18n";
import { normaliserDomaine } from "@/lib/domaines";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Motifs de refus de `zabelie_domaine_demander` (0125) → message traduit. */
const MOTIFS: Record<string, I18nKey> = {
  format: "domain.err.format",
  kyc_requis: "domain.err.kyc",
  boutique_sans_adresse: "domain.err.slug",
  pris: "domain.err.taken",
  compte_inactif: "domain.err.inactive",
};

async function vendeur() {
  const lang = await getLang();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { lang, user };
}

/**
 * POST /api/account/domain { domaine } — demande du vendeur connecté.
 * DELETE — retrait. L'identité vient de la SESSION ; la base décide de
 * l'éligibilité (vérification approuvée, compte actif, adresse de boutique).
 */
export async function POST(req: Request) {
  const { lang, user } = await vendeur();
  if (!user) return NextResponse.json({ error: t(lang, "api.auth.required") }, { status: 401 });
  const bloque = await requireActiveAccount(user.id);
  if (bloque) return bloque;
  let corps: { domaine?: unknown } = {};
  try { corps = await req.json(); } catch { /* corps absent */ }
  const domaine = typeof corps.domaine === "string" ? normaliserDomaine(corps.domaine) : null;
  if (!domaine) return NextResponse.json({ error: t(lang, "domain.err.format"), code: "format" }, { status: 422 });
  const { data, error } = await createAdminClient().rpc("zabelie_domaine_demander", { p_user: user.id, p_domaine: domaine });
  if (error || !data) {
    console.error("[domaine] demande impossible", error?.code ?? "vide");
    return NextResponse.json({ error: t(lang, "api.unavailable"), code: "unavailable" }, { status: 503 });
  }
  const r = data as { ok: boolean; reason?: string; domaine?: string; statut?: string };
  if (!r.ok) {
    const cle = MOTIFS[r.reason ?? ""] ?? "error.generic";
    return NextResponse.json({ error: t(lang, cle), code: r.reason ?? "refuse" }, { status: r.reason === "kyc_requis" ? 403 : 422 });
  }
  return NextResponse.json({ ok: true, domaine: r.domaine, statut: r.statut });
}

export async function DELETE() {
  const { lang, user } = await vendeur();
  if (!user) return NextResponse.json({ error: t(lang, "api.auth.required") }, { status: 401 });
  const { error } = await createAdminClient().rpc("zabelie_domaine_retirer", { p_user: user.id });
  if (error) return NextResponse.json({ error: t(lang, "api.unavailable"), code: "unavailable" }, { status: 503 });
  return NextResponse.json({ ok: true });
}
