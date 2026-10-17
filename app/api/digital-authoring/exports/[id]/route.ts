import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireActiveAccount } from "@/lib/auth";
import { getLang } from "@/lib/i18n-server";
import { erreurAvecLangue } from "@/lib/api-erreur";
import { UUID_RE } from "@/lib/digital-studio";
import { AUTHORING_BUCKET } from "@/lib/storage-buckets";
import { creationActive, lireEnvCreation } from "@/lib/digital-authoring/flags";
import { ENTETES_PRIVEES, traduireErreurBase } from "@/lib/digital-authoring/api";
import { LIEN_SECONDES, TABLE_EXPORTS } from "@/lib/digital-authoring/export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Contexte = { params: Promise<{ id: string }> };

const HEX64 = /^[0-9a-f]{64}$/;

/**
 * GET  /api/digital-authoring/exports/[id]?document=guide|extrait[&telecharger=1]
 *      → redirection vers une URL signée de cinq minutes (aperçu, ou
 *        téléchargement avec `telecharger=1`).
 * POST /api/digital-authoring/exports/[id]  { empreinte }
 *      → approuve CET export, celui dont l'empreinte a été montrée (T28).
 *
 * Tâche 4.3. La ligne est lue sous le JWT du vendeur : la RLS de 0147 rend
 * l'export d'un autre INTROUVABLE (404). La clé de service ne sert qu'à
 * signer l'URL (C1-A), après ce contrôle.
 */
async function acces(ctx: Contexte, legal: boolean) {
  const lang = await getLang();
  if (!creationActive(lireEnvCreation())) return { reponse: erreurAvecLangue(lang, "api.feature.off", 404) } as const;
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return { reponse: erreurAvecLangue(lang, "authoring.export.introuvable", 404) } as const;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { reponse: erreurAvecLangue(lang, "api.auth.required", 401) } as const;
  const refus = await requireActiveAccount(user.id, { legalAcceptance: legal });
  if (refus) return { reponse: refus } as const;
  return { lang, id, supabase } as const;
}

export async function GET(req: Request, ctx: Contexte) {
  const a = await acces(ctx, false);
  if ("reponse" in a) return a.reponse;
  const parametres = new URL(req.url).searchParams;
  const doc = parametres.get("document") ?? "guide";
  if (doc !== "guide" && doc !== "extrait") return erreurAvecLangue(a.lang, "api.params.invalid", 400);

  const { data: ligne, error } = await a.supabase
    .from(TABLE_EXPORTS)
    .select("chemin, extrait_chemin")
    .eq("id", a.id)
    .maybeSingle();
  if (error) return erreurAvecLangue(a.lang, "api.unavailable", 503);
  const chemin = doc === "guide" ? ligne?.chemin : ligne?.extrait_chemin;
  if (typeof chemin !== "string" || !chemin) return erreurAvecLangue(a.lang, "authoring.export.introuvable", 404);

  const nom = doc === "guide" ? "guide.pdf" : "extrait.pdf";
  const { data: signe, error: erreurSignature } = await createAdminClient()
    .storage.from(AUTHORING_BUCKET)
    .createSignedUrl(chemin, LIEN_SECONDES, parametres.get("telecharger") === "1" ? { download: nom } : undefined);
  if (erreurSignature || !signe?.signedUrl) {
    console.error("[authoring] lien signe refuse");
    return erreurAvecLangue(a.lang, "api.unavailable", 503);
  }
  const reponse = NextResponse.redirect(signe.signedUrl, 303);
  reponse.headers.set("Cache-Control", ENTETES_PRIVEES["Cache-Control"]);
  reponse.headers.set("Referrer-Policy", "no-referrer");
  return reponse;
}

export async function POST(req: Request, ctx: Contexte) {
  const a = await acces(ctx, true);
  if ("reponse" in a) return a.reponse;
  let empreinte: unknown;
  try {
    const brut = await req.json();
    if (!brut || typeof brut !== "object" || Array.isArray(brut)) throw new Error("forme");
    empreinte = (brut as Record<string, unknown>).empreinte;
  } catch {
    return erreurAvecLangue(a.lang, "api.json.invalid", 400);
  }
  if (typeof empreinte !== "string" || !HEX64.test(empreinte)) return erreurAvecLangue(a.lang, "api.params.invalid", 400);

  const { data, error } = await a.supabase.rpc("zabelie_authoring_approuver_export", { p_export: a.id, p_empreinte: empreinte });
  if (error) {
    const t = traduireErreurBase(error);
    if (t.statut === 500) console.error("[authoring] approbation d'export refusee", error.code ?? "sans code");
    return erreurAvecLangue(a.lang, t.cle, t.statut, { code: t.code });
  }
  return NextResponse.json({ ok: true, approuveLe: data }, { headers: ENTETES_PRIVEES });
}
