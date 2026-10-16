import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireActiveAccount } from "@/lib/auth";
import { rateLimit } from "@/lib/zabelie-rate-limit";
import { getLang } from "@/lib/i18n-server";
import { erreurAvecLangue } from "@/lib/api-erreur";
import { UUID_RE } from "@/lib/digital-studio";
import { choisirMoteur, creationActive, lireEnvCreation } from "@/lib/digital-authoring/flags";
import { fournisseurEditorial } from "@/lib/digital-authoring/provider";
import { executerEtape, type ClientSysteme } from "@/lib/digital-authoring/executor";
import { TYPES_OPERATION, type TypeOperation } from "@/lib/digital-authoring/operations";
import {
  COLONNES_OPERATION,
  ENTETES_PRIVEES,
  TABLE_CONFIG,
  TABLE_OPERATIONS,
  limitesDepuisConfig,
  operationPourClient,
  traduireErreurBase,
} from "@/lib/digital-authoring/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Un envoi au fournisseur ne dépasse jamais ce délai (PRD §10.2.5) ; au-delà : `uncertain`. */
const DELAI_FOURNISSEUR_MS = 30_000;

/**
 * POST /api/digital-authoring/operations  { projetId, type, sectionId, cle }
 * GET  /api/digital-authoring/operations?projet=<id>  → dernières opérations + quota
 *
 * Studio de création éditoriale (docs/70 §6, tâche 3.2).
 *
 * La DEMANDE passe par le JWT du vendeur (`zabelie_authoring_demander` :
 * rejeu, quotas, instantané). L'EXÉCUTION passe par le contrat système
 * (service role) : bail, soumission, conclusion — jamais un identifiant de
 * vendeur fourni par le client (décision C1-A). Une étape est tentée tout de
 * suite ; un fournisseur lent rend la main au sondage (GET …/[id]).
 */
export async function POST(req: Request) {
  const lang = await getLang();
  const env = lireEnvCreation();
  if (!creationActive(env)) return erreurAvecLangue(lang, "api.feature.off", 404);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return erreurAvecLangue(lang, "api.auth.required", 401);
  const refus = await requireActiveAccount(user.id, { legalAcceptance: true });
  if (refus) return refus;
  // IA coupée : aucune demande inscrite, aucun quota consommé.
  if (!choisirMoteur(env).ok) return erreurAvecLangue(lang, "authoring.ia.coupee", 503, { code: "ia_coupee" });

  let corps: Record<string, unknown>;
  try {
    const brut = await req.json();
    if (!brut || typeof brut !== "object" || Array.isArray(brut)) throw new Error("forme");
    corps = brut as Record<string, unknown>;
  } catch {
    return erreurAvecLangue(lang, "api.json.invalid", 400);
  }
  const { projetId, type, sectionId, cle } = corps;
  if (
    typeof projetId !== "string" || !UUID_RE.test(projetId)
    || typeof cle !== "string" || !UUID_RE.test(cle)
    || !(TYPES_OPERATION as readonly unknown[]).includes(type)
    || !(sectionId === null || (typeof sectionId === "string" && UUID_RE.test(sectionId)))
  ) {
    return erreurAvecLangue(lang, "api.params.invalid", 400);
  }
  const admin = createAdminClient();
  if (!(await rateLimit(admin, `authoring:ia:${user.id}`, 20, 60))) {
    return erreurAvecLangue(lang, "api.rate.limited", 429);
  }

  const { data: demande, error } = await supabase
    .rpc("zabelie_authoring_demander", { p_projet: projetId, p_type: type as TypeOperation, p_section: sectionId, p_cle: cle })
    .single<{ id: string; etat: string }>();
  if (error || !demande) {
    const t = traduireErreurBase(error);
    if (t.statut === 500) console.error("[authoring] demande refusee", error?.code ?? "sans code");
    return erreurAvecLangue(lang, t.cle, t.statut, { code: t.code });
  }

  if (demande.etat === "queued") {
    const { data: config } = await supabase.from(TABLE_CONFIG).select("*").maybeSingle();
    const limites = limitesDepuisConfig(config);
    if (limites) {
      try {
        await executerEtape(
          { admin: admin as unknown as ClientSysteme, fournisseur: () => fournisseurEditorial(lireEnvCreation()), limites, delaiMs: DELAI_FOURNISSEUR_MS },
          demande.id
        );
      } catch (err) {
        // L'opération reste inscrite : le sondage reprendra, ou elle deviendra incertaine.
        console.error("[authoring] etape interrompue", err instanceof Error ? err.message : "inconnue");
      }
    }
  }

  const [{ data: ligne }, { data: quota }] = await Promise.all([
    supabase.from(TABLE_OPERATIONS).select(COLONNES_OPERATION).eq("id", demande.id).maybeSingle(),
    supabase.rpc("zabelie_authoring_quota").maybeSingle(),
  ]);
  return NextResponse.json({ operation: operationPourClient(ligne), quota: quota ?? null }, { status: 201, headers: ENTETES_PRIVEES });
}

export async function GET(req: Request) {
  const lang = await getLang();
  if (!creationActive(lireEnvCreation())) return erreurAvecLangue(lang, "api.feature.off", 404);
  const projet = new URL(req.url).searchParams.get("projet") ?? "";
  if (!UUID_RE.test(projet)) return erreurAvecLangue(lang, "api.params.invalid", 400);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return erreurAvecLangue(lang, "api.auth.required", 401);
  const refus = await requireActiveAccount(user.id);
  if (refus) return refus;

  const [{ data: lignes, error }, { data: quota }] = await Promise.all([
    supabase.from(TABLE_OPERATIONS).select(COLONNES_OPERATION).eq("project_id", projet).order("created_at", { ascending: false }).limit(20),
    supabase.rpc("zabelie_authoring_quota").maybeSingle(),
  ]);
  if (error) return erreurAvecLangue(lang, "api.unavailable", 503);
  const operations = (Array.isArray(lignes) ? lignes : []).map(operationPourClient).filter(Boolean);
  return NextResponse.json({ operations, quota: quota ?? null }, { headers: ENTETES_PRIVEES });
}
