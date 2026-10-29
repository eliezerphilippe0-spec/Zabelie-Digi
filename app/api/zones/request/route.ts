import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { UUID_RE } from "@/lib/collections";
import { echecBase, erreurTraduite } from "@/lib/api-erreur";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/zones/request  { kominId, nom }
 *
 * Un vendeur propose un katye manquant, rattaché à une komin existante
 * (PR-Z4, arbitrage Z-C : modération humaine — rien ne naît ici, une
 * demande s'inscrit). L'insertion passe par la SESSION de l'utilisateur :
 * la RLS impose `requester = auth.uid()`, le trigger ZB070 impose la cible
 * komin, l'index partiel refuse le doublon en attente. On ne duplique
 * aucun de ces gardes — on traduit leurs refus en réponses.
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  }

  let body: { expectedActorId?: unknown; kominId?: unknown; nom?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return erreurTraduite("api.params.invalid", 400);
  }
  // Précondition du formulaire, jamais une source de propriété. Les anciens
  // clients restent compatibles ; la session vérifiée demeure le demandeur.
  if (body.expectedActorId !== undefined) {
    if (typeof body.expectedActorId !== "string" || !UUID_RE.test(body.expectedActorId)) {
      return erreurTraduite("api.params.invalid", 400);
    }
    if (body.expectedActorId !== user.id) return erreurTraduite("api.auth.required", 403);
  }

  const kominId = typeof body.kominId === "string" ? body.kominId.trim() : "";
  const nom = typeof body.nom === "string" ? body.nom.trim() : "";
  if (!kominId || nom.length < 2 || nom.length > 80) {
    return NextResponse.json(
      { error: "kominId et nom (2 à 80 caractères) requis" },
      { status: 400 },
    );
  }

  const { error } = await supabase.from("zabelie_zone_requests").insert({
    requester: user.id,
    komin_id: kominId,
    nom_propose: nom,
  });

  if (error) {
    // 23505 = doublon en attente : la même graphie attend déjà sa revue.
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "Cette demande existe déjà et attend sa revue." },
        { status: 409 },
      );
    }
    // ZB070 = cible invalide (pas une komin, ou fermée) — erreur de saisie.
    if (error.message.includes("ZB070")) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return echecBase("zones/request", error, "api.write.failed", 500);
  }
  return NextResponse.json({ ok: true });
}
