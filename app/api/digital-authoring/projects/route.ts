import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireActiveAccount } from "@/lib/auth";
import { rateLimit } from "@/lib/zabelie-rate-limit";
import { getLang } from "@/lib/i18n-server";
import { erreurAvecLangue } from "@/lib/api-erreur";
import { creationActive, lireEnvCreation } from "@/lib/digital-authoring/flags";
import { lire, schemaProjet } from "@/lib/digital-authoring/schema";
import {
  COLONNES_RESUME,
  ENTETES_PRIVEES,
  TABLE_CONFIG,
  TABLE_PROJETS,
  cleRefus,
  limitesDepuisConfig,
  traduireErreurBase,
} from "@/lib/digital-authoring/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET  /api/digital-authoring/projects  → les projets du vendeur (résumés)
 * POST /api/digital-authoring/projects  { titre, langue, public, marcheDiaspora }
 *
 * Studio de création éditoriale (docs/70, tâche 2.2).
 *
 * ⚠️ CLIENT DE SESSION pour tout accès aux projets (décision C1-A) : la RLS
 * de 0141 ne rend que les projets de l'appelant, et la création passe par
 * une fonction qui lit `auth.uid()`. La clé de service ne sert qu'au
 * plafond de débit, comme partout ailleurs.
 */
export async function GET() {
  const lang = await getLang();
  if (!creationActive(lireEnvCreation())) return erreurAvecLangue(lang, "api.feature.off", 404);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return erreurAvecLangue(lang, "api.auth.required", 401);
  const refus = await requireActiveAccount(user.id);
  if (refus) return refus;

  const { data, error } = await supabase
    .from(TABLE_PROJETS)
    .select(COLONNES_RESUME)
    .order("updated_at", { ascending: false })
    .limit(100);
  if (error) return erreurAvecLangue(lang, "api.unavailable", 503);
  return NextResponse.json({ projets: data ?? [] }, { headers: ENTETES_PRIVEES });
}

export async function POST(req: Request) {
  const lang = await getLang();
  if (!creationActive(lireEnvCreation())) return erreurAvecLangue(lang, "api.feature.off", 404);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return erreurAvecLangue(lang, "api.auth.required", 401);
  const refus = await requireActiveAccount(user.id, { legalAcceptance: true });
  if (refus) return refus;

  let corps: unknown;
  try {
    corps = await req.json();
  } catch {
    return erreurAvecLangue(lang, "api.json.invalid", 400);
  }
  if (!(await rateLimit(createAdminClient(), `authoring:creer:${user.id}`, 10, 3600))) {
    return erreurAvecLangue(lang, "api.rate.limited", 429);
  }

  // Les limites viennent de la base (règle dure n°3), lues sous le JWT.
  const { data: config, error: erreurConfig } = await supabase.from(TABLE_CONFIG).select("*").maybeSingle();
  const limites = erreurConfig ? null : limitesDepuisConfig(config);
  if (!limites) return erreurAvecLangue(lang, "api.unavailable", 503);

  const lu = lire(schemaProjet(limites), corps);
  if (!lu.ok) return erreurAvecLangue(lang, cleRefus(lu.code), 422, { code: lu.code });

  const { data, error } = await supabase
    .rpc("zabelie_authoring_creer_projet", {
      p_titre: lu.valeur.titre,
      p_langue: lu.valeur.langue,
      p_public: lu.valeur.public,
      p_marche: lu.valeur.marcheDiaspora,
    })
    .single();
  if (error || !data) {
    const t = traduireErreurBase(error);
    if (t.statut === 500) console.error("[authoring] creation refusee", error?.code ?? "sans code");
    return erreurAvecLangue(lang, t.cle, t.statut, { code: t.code });
  }
  return NextResponse.json({ projet: data }, { status: 201, headers: ENTETES_PRIVEES });
}
