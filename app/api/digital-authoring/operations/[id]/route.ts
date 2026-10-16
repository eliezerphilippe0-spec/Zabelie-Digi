import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireActiveAccount } from "@/lib/auth";
import { getLang } from "@/lib/i18n-server";
import { erreurAvecLangue } from "@/lib/api-erreur";
import { UUID_RE } from "@/lib/digital-studio";
import { creationActive, lireEnvCreation } from "@/lib/digital-authoring/flags";
import { fournisseurEditorial } from "@/lib/digital-authoring/provider";
import { executerEtape, type ClientSysteme } from "@/lib/digital-authoring/executor";
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

const DELAI_FOURNISSEUR_MS = 30_000;

type Contexte = { params: Promise<{ id: string }> };

/**
 * GET  /api/digital-authoring/operations/[id]  → l'état, et une étape si elle attend
 * POST /api/digital-authoring/operations/[id]  { action: "annuler" }
 *
 * Le sondage fait avancer l'opération (motif du Studio images) : aucun
 * exécuteur durable n'existe, et le PRD n'en promet pas (§10.5). La lecture
 * passe par la RLS : l'opération d'un autre vendeur est INTROUVABLE (404).
 * Une étape lancée ici repasse par toutes les vérifications — IA coupée ou
 * vendeur suspendu entre-temps : rien ne part (T25, T30).
 */
async function acces(ctx: Contexte) {
  const lang = await getLang();
  if (!creationActive(lireEnvCreation())) return { reponse: erreurAvecLangue(lang, "api.feature.off", 404) } as const;
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return { reponse: erreurAvecLangue(lang, "authoring.introuvable", 404) } as const;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { reponse: erreurAvecLangue(lang, "api.auth.required", 401) } as const;
  const refus = await requireActiveAccount(user.id);
  if (refus) return { reponse: refus } as const;
  return { lang, id, supabase } as const;
}

export async function GET(_req: Request, ctx: Contexte) {
  const a = await acces(ctx);
  if ("reponse" in a) return a.reponse;
  const { lang, id, supabase } = a;
  const lireOperation = () => supabase.from(TABLE_OPERATIONS).select(COLONNES_OPERATION).eq("id", id).maybeSingle();

  let { data: ligne, error } = await lireOperation();
  if (error) return erreurAvecLangue(lang, "api.unavailable", 503);
  if (!ligne) return erreurAvecLangue(lang, "authoring.introuvable", 404);

  const etat = (ligne as { etat?: string }).etat;
  if (etat === "queued" || etat === "running") {
    const { data: config } = await supabase.from(TABLE_CONFIG).select("*").maybeSingle();
    const limites = limitesDepuisConfig(config);
    if (limites) {
      try {
        await executerEtape(
          { admin: createAdminClient() as unknown as ClientSysteme, fournisseur: () => fournisseurEditorial(lireEnvCreation()), limites, delaiMs: DELAI_FOURNISSEUR_MS },
          id
        );
      } catch (err) {
        console.error("[authoring] etape interrompue", err instanceof Error ? err.message : "inconnue");
      }
      ({ data: ligne, error } = await lireOperation());
      if (error || !ligne) return erreurAvecLangue(lang, "api.unavailable", 503);
    }
  }
  const { data: quota } = await supabase.rpc("zabelie_authoring_quota").maybeSingle();
  return NextResponse.json({ operation: operationPourClient(ligne), quota: quota ?? null }, { headers: ENTETES_PRIVEES });
}

export async function POST(req: Request, ctx: Contexte) {
  const a = await acces(ctx);
  if ("reponse" in a) return a.reponse;
  const { lang, id, supabase } = a;
  let corps: Record<string, unknown>;
  try {
    const brut = await req.json();
    if (!brut || typeof brut !== "object" || Array.isArray(brut)) throw new Error("forme");
    corps = brut as Record<string, unknown>;
  } catch {
    return erreurAvecLangue(lang, "api.json.invalid", 400);
  }
  if (corps.action !== "annuler") return erreurAvecLangue(lang, "api.params.invalid", 400);
  const { error } = await supabase.rpc("zabelie_authoring_annuler", { p_operation: id });
  if (error) {
    const t = traduireErreurBase(error);
    if (t.statut === 500) console.error("[authoring] annulation refusee", error.code ?? "sans code");
    return erreurAvecLangue(lang, t.cle, t.statut, { code: t.code });
  }
  return NextResponse.json({ ok: true }, { headers: ENTETES_PRIVEES });
}
