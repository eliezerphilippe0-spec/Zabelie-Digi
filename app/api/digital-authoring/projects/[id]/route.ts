import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireActiveAccount } from "@/lib/auth";
import { rateLimit } from "@/lib/zabelie-rate-limit";
import { getLang } from "@/lib/i18n-server";
import { erreurAvecLangue } from "@/lib/api-erreur";
import { UUID_RE } from "@/lib/digital-studio";
import { creationActive, lireEnvCreation } from "@/lib/digital-authoring/flags";
import { lire, remplirBrief, schemaBrief, schemaContenu, schemaProjet } from "@/lib/digital-authoring/schema";
import { revisionValide } from "@/lib/digital-authoring/revision";
import { ficheTest } from "@/lib/digital-authoring/quality";
import {
  ENTETES_PRIVEES,
  TABLE_CONFIG,
  TABLE_PROJETS,
  cleRefus,
  limitesDepuisConfig,
  projetPourEditeur,
  traduireErreurBase,
} from "@/lib/digital-authoring/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Contexte = { params: Promise<{ id: string }> };

/**
 * GET   /api/digital-authoring/projects/[id]  → le projet complet
 * PATCH /api/digital-authoring/projects/[id]  { revisionAttendue, jeton, projet?, brief?, contenu? }
 * POST  /api/digital-authoring/projects/[id]  { action: "approuver_plan", revision }
 *                                              | { action: "approuver_guide", revision, responsabilite: true }
 *                                              | { action: "archiver" }
 *
 * La sauvegarde accepte un travail INCOMPLET (mode `brouillon`) ; l'approbation
 * du plan exige le brief et le plan complets, relus en base (mode `complet`).
 * L'approbation du guide (tâche 4.2) refait la fiche-test sur le texte EN
 * BASE, à la révision demandée : un point bloquant rend 422 avec la fiche.
 *
 * Studio de création éditoriale (docs/70, tâche 2.2). Client de SESSION
 * partout : la RLS de 0141 cache les projets des autres, si bien qu'un
 * identifiant étranger rend 404 — jamais un 403 qui confirmerait qu'il existe.
 *
 * La sauvegarde compare la révision EN BASE (`… and revision = attendue`) :
 * zéro ligne = conflit, avec la révision et le jeton du serveur, pour que
 * l'écran tranche (lib/digital-authoring/revision.ts) sans rien écraser.
 */
async function acces(ctx: Contexte, legal = false) {
  const lang = await getLang();
  if (!creationActive(lireEnvCreation())) return { reponse: erreurAvecLangue(lang, "api.feature.off", 404) } as const;
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return { reponse: erreurAvecLangue(lang, "authoring.introuvable", 404) } as const;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { reponse: erreurAvecLangue(lang, "api.auth.required", 401) } as const;
  const refus = await requireActiveAccount(user.id, { legalAcceptance: legal });
  if (refus) return { reponse: refus } as const;
  return { lang, id, supabase, user } as const;
}

export async function GET(_req: Request, ctx: Contexte) {
  const a = await acces(ctx);
  if ("reponse" in a) return a.reponse;
  const { data, error } = await a.supabase.from(TABLE_PROJETS).select("*").eq("id", a.id).maybeSingle();
  if (error) return erreurAvecLangue(a.lang, "api.unavailable", 503);
  if (!data) return erreurAvecLangue(a.lang, "authoring.introuvable", 404);
  return NextResponse.json({ projet: data }, { headers: ENTETES_PRIVEES });
}

export async function PATCH(req: Request, ctx: Contexte) {
  const a = await acces(ctx, true);
  if ("reponse" in a) return a.reponse;
  const { lang, id, supabase, user } = a;

  let corps: Record<string, unknown>;
  try {
    const brut = await req.json();
    if (!brut || typeof brut !== "object" || Array.isArray(brut)) throw new Error("forme");
    corps = brut as Record<string, unknown>;
  } catch {
    return erreurAvecLangue(lang, "api.json.invalid", 400);
  }
  const { revisionAttendue, jeton } = corps;
  if (!revisionValide(revisionAttendue) || typeof jeton !== "string" || !UUID_RE.test(jeton)) {
    return erreurAvecLangue(lang, "api.params.invalid", 400);
  }
  if (corps.projet === undefined && corps.brief === undefined && corps.contenu === undefined) {
    return erreurAvecLangue(lang, "api.params.invalid", 400);
  }
  // Une sauvegarde par seconde d'inactivité (PRD §7) : le plafond la laisse passer.
  if (!(await rateLimit(createAdminClient(), `authoring:sauver:${user.id}`, 120, 60))) {
    return erreurAvecLangue(lang, "api.rate.limited", 429);
  }

  const { data: config, error: erreurConfig } = await supabase.from(TABLE_CONFIG).select("*").maybeSingle();
  const limites = erreurConfig ? null : limitesDepuisConfig(config);
  if (!limites) return erreurAvecLangue(lang, "api.unavailable", 503);

  const maj: Record<string, unknown> = { derniere_sauvegarde: jeton };
  if (corps.projet !== undefined) {
    const p = lire(schemaProjet(limites), corps.projet);
    if (!p.ok) return erreurAvecLangue(lang, cleRefus(p.code), 422, { code: p.code });
    Object.assign(maj, {
      titre: p.valeur.titre,
      langue: p.valeur.langue,
      public_vise: p.valeur.public,
      marche_diaspora: p.valeur.marcheDiaspora,
    });
  }
  // Brouillon : un travail en cours s'enregistre même incomplet. Le complet
  // est exigé à l'approbation du plan (POST ci-dessous).
  if (corps.brief !== undefined) {
    const b = lire(schemaBrief(limites, "brouillon"), corps.brief);
    if (!b.ok) return erreurAvecLangue(lang, cleRefus(b.code), 422, { code: b.code });
    maj.brief = b.valeur;
  }
  if (corps.contenu !== undefined) {
    const c = lire(schemaContenu(limites, "brouillon"), corps.contenu);
    if (!c.ok) return erreurAvecLangue(lang, cleRefus(c.code), 422, { code: c.code });
    maj.contenu = c.valeur;
  }

  const { data, error } = await supabase
    .from(TABLE_PROJETS)
    .update(maj)
    .eq("id", id)
    .eq("revision", revisionAttendue)
    .select("revision, derniere_sauvegarde, updated_at");
  if (error) {
    const t = traduireErreurBase(error);
    if (t.statut === 500) console.error("[authoring] sauvegarde refusee", error.code ?? "sans code");
    return erreurAvecLangue(lang, t.cle, t.statut, { code: t.code });
  }
  if (Array.isArray(data) && data.length === 1) {
    return NextResponse.json(
      { revision: data[0].revision, jeton: data[0].derniere_sauvegarde, updatedAt: data[0].updated_at },
      { headers: ENTETES_PRIVEES }
    );
  }

  // Zéro ligne : projet absent (ou d'un autre), archivé, ou révision dépassée.
  const { data: actuel, error: erreurLecture } = await supabase
    .from(TABLE_PROJETS)
    .select("revision, derniere_sauvegarde, archived_at")
    .eq("id", id)
    .maybeSingle();
  if (erreurLecture) return erreurAvecLangue(lang, "api.unavailable", 503);
  if (!actuel) return erreurAvecLangue(lang, "authoring.introuvable", 404);
  if (actuel.archived_at) return erreurAvecLangue(lang, "authoring.archive", 409, { code: "archive" });
  return erreurAvecLangue(lang, "authoring.conflit", 409, {
    code: "conflit",
    revisionServeur: actuel.revision,
    jetonServeur: actuel.derniere_sauvegarde,
  });
}

export async function POST(req: Request, ctx: Contexte) {
  const a = await acces(ctx, true);
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

  let appel;
  if (corps.action === "approuver_plan" && revisionValide(corps.revision)) {
    // Approuver exige un brief et un plan COMPLETS, lus en base — pas ceux
    // que le navigateur croit avoir. La fonction de 0141 tient la révision
    // exacte et le plan non vide.
    const [{ data: ligne, error: erreurLecture }, { data: config, error: erreurConfig }] = await Promise.all([
      supabase.from(TABLE_PROJETS).select("brief, contenu").eq("id", id).maybeSingle(),
      supabase.from(TABLE_CONFIG).select("*").maybeSingle(),
    ]);
    if (erreurLecture) return erreurAvecLangue(lang, "api.unavailable", 503);
    if (!ligne) return erreurAvecLangue(lang, "authoring.introuvable", 404);
    const limites = erreurConfig ? null : limitesDepuisConfig(config);
    if (!limites) return erreurAvecLangue(lang, "api.unavailable", 503);
    const b = lire(schemaBrief(limites, "complet"), remplirBrief(ligne.brief));
    if (!b.ok) return erreurAvecLangue(lang, cleRefus(b.code), 422, { code: b.code });
    const c = lire(schemaContenu(limites, "complet"), ligne.contenu);
    if (!c.ok) return erreurAvecLangue(lang, cleRefus(c.code), 422, { code: c.code });
    appel = supabase.rpc("zabelie_authoring_approuver_plan", { p_projet: id, p_revision: corps.revision });
  } else if (corps.action === "approuver_guide" && revisionValide(corps.revision)) {
    // La case de responsabilité n'est jamais présumée : seul `true` passe.
    if (corps.responsabilite !== true) {
      return erreurAvecLangue(lang, "authoring.approbation.responsabilite", 422, { code: "authoring_responsabilite_requise" });
    }
    const { data: ligne, error: erreurLecture } = await supabase
      .from(TABLE_PROJETS)
      .select("id, titre, contenu, revision, plan_approuve_revision, archived_at")
      .eq("id", id)
      .maybeSingle();
    if (erreurLecture) return erreurAvecLangue(lang, "api.unavailable", 503);
    const p = projetPourEditeur(ligne);
    if (!p) return erreurAvecLangue(lang, "authoring.introuvable", 404);
    if (p.archive) return erreurAvecLangue(lang, "authoring.archive", 409, { code: "archive" });
    // La fiche porte sur LA révision approuvée : si le texte a bougé, conflit.
    if (p.revision !== corps.revision) return erreurAvecLangue(lang, "authoring.conflit", 409, { code: "conflit" });
    const fiche = ficheTest({ titre: p.titre, contenu: p.contenu, planApprouve: p.planApprouveRevision !== null });
    if (fiche.bloquants > 0) {
      return erreurAvecLangue(lang, "authoring.approbation.pasPret", 422, { code: "guide_pas_pret", fiche });
    }
    appel = supabase.rpc("zabelie_authoring_approuver_revision", {
      p_projet: id,
      p_revision: corps.revision,
      p_responsabilite: true,
    });
  } else if (corps.action === "archiver") {
    appel = supabase.rpc("zabelie_authoring_archiver", { p_projet: id });
  } else {
    return erreurAvecLangue(lang, "api.params.invalid", 400);
  }
  const { data, error } = await appel;
  if (error) {
    const t = traduireErreurBase(error);
    if (t.statut === 500) console.error("[authoring] action refusee", error.code ?? "sans code");
    return erreurAvecLangue(lang, t.cle, t.statut, { code: t.code });
  }
  return NextResponse.json({ ok: true, resultat: data }, { headers: ENTETES_PRIVEES });
}
