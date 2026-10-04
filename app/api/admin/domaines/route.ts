import { NextResponse } from "next/server";
import { erreurTraduite } from "@/lib/api-erreur";
import { getAdminUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { journaliserActeAdmin } from "@/lib/admin-audit";
import { domainePointeVersZabelie } from "@/lib/domaine-sonde";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Décision admin sur un domaine vendeur (0125).
 *   POST { sellerId, action: 'activer' | 'refuser', note? }
 *
 * Branchement MANUEL (arbitrage porteur 2026-10-04) : l'admin ajoute d'abord
 * le domaine dans Vercel (Settings → Domains). L'activation vérifie ensuite
 * que le domaine atteint bien CE déploiement ; la base recontrôle
 * l'éligibilité du vendeur. Chaque décision est journalisée (0055).
 */
export async function POST(req: Request) {
  const me = await getAdminUser();
  if (!me || me.role !== "admin") return erreurTraduite("api.access.denied", 403);
  let body: { sellerId?: string; action?: string; note?: string };
  try { body = await req.json(); } catch { return erreurTraduite("api.json.invalid", 400); }
  const activer = body.action === "activer" ? true : body.action === "refuser" ? false : null;
  if (!body.sellerId || activer === null) return erreurTraduite("api.params.invalid", 400);

  const admin = createAdminClient();
  const { data: ligne } = await admin.from("zabelie_seller_domains").select("domaine").eq("seller_id", body.sellerId).maybeSingle();
  if (!ligne) return NextResponse.json({ ok: false, error: "Demande introuvable." }, { status: 404 });

  if (activer) {
    const sonde = await domainePointeVersZabelie(ligne.domaine);
    if (!sonde.ok) {
      return NextResponse.json({ ok: false, error: `Le domaine n'atteint pas encore Zabelie (${sonde.detail}). Ajoutez-le dans Vercel et attendez la propagation DNS.` }, { status: 409 });
    }
  }
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 300) : "";
  const { data, error } = await admin.rpc("zabelie_domaine_decider", { p_seller: body.sellerId, p_activer: activer, p_note: note || null });
  const r = data as { ok: boolean; reason?: string } | null;
  if (error || !r) return erreurTraduite("api.write.failed", 503);
  if (!r.ok) {
    const msg = r.reason === "non_eligible" ? "Vendeur non éligible : vérification non approuvée, compte suspendu ou boutique sans adresse."
      : r.reason === "motif_requis" ? "Un refus exige un motif : le vendeur doit savoir quoi corriger." : "Décision impossible.";
    return NextResponse.json({ ok: false, error: msg }, { status: 422 });
  }
  await journaliserActeAdmin(admin, {
    actorId: me.id,
    action: activer ? "domaine.activer" : "domaine.refuser",
    targetType: "profile",
    targetId: body.sellerId,
    reason: note || undefined,
    metadata: { domaine: ligne.domaine },
  });
  return NextResponse.json({ ok: true });
}
