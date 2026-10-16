import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireActiveAccount } from "@/lib/auth";
import { rateLimit } from "@/lib/zabelie-rate-limit";
import { getLang } from "@/lib/i18n-server";
import { erreurAvecLangue } from "@/lib/api-erreur";
import { UUID_RE } from "@/lib/digital-studio";
import { AUTHORING_BUCKET } from "@/lib/storage-buckets";
import { creationActive, lireEnvCreation } from "@/lib/digital-authoring/flags";
import { revisionValide } from "@/lib/digital-authoring/revision";
import { ficheTest } from "@/lib/digital-authoring/quality";
import { ENTETES_PRIVEES, TABLE_PROJETS, projetPourEditeur, traduireErreurBase } from "@/lib/digital-authoring/api";
import { MOTEUR_PDF, cheminExport, cheminExtrait, exportPourClient, guidePourPdf } from "@/lib/digital-authoring/export";
import { rendreExtraitPdf, rendreGuidePdf } from "@/lib/digital-authoring/pdf/guide-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Contexte = { params: Promise<{ id: string }> };

/** Dix rendus par vendeur et par dix minutes : un rendu coûte du calcul et du stockage. */
const RENDUS_MAX = 10;
const RENDUS_FENETRE = 600;

/**
 * POST /api/digital-authoring/projects/[id]/exports  { revision }
 *
 * Rend le PDF du guide et son extrait gratuit depuis la révision APPROUVÉE
 * (0144), les dépose dans le bucket privé, puis enregistre la ligne (0145).
 * Tâche 4.3 ; docs/70 §7.4.
 *
 * Décision C1-A : la clé de service ne sert qu'au limiteur, au dépôt des
 * octets et à la fonction d'enregistrement (contrat système) — toujours
 * APRÈS le contrôle de session et la relecture du projet sous le JWT du
 * vendeur. Les octets, leur empreinte et leur taille viennent du serveur,
 * jamais du navigateur. Le moteur est déterministe : rendre deux fois la même
 * révision donne les mêmes octets, le même chemin et la même ligne.
 */
export async function POST(req: Request, ctx: Contexte) {
  const lang = await getLang();
  if (!creationActive(lireEnvCreation())) return erreurAvecLangue(lang, "api.feature.off", 404);
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return erreurAvecLangue(lang, "authoring.introuvable", 404);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return erreurAvecLangue(lang, "api.auth.required", 401);
  const refus = await requireActiveAccount(user.id, { legalAcceptance: true });
  if (refus) return refus;

  let revision: unknown;
  try {
    const brut = await req.json();
    if (!brut || typeof brut !== "object" || Array.isArray(brut)) throw new Error("forme");
    revision = (brut as Record<string, unknown>).revision;
  } catch {
    return erreurAvecLangue(lang, "api.json.invalid", 400);
  }
  if (!revisionValide(revision)) return erreurAvecLangue(lang, "api.params.invalid", 400);

  const admin = createAdminClient();
  if (!(await rateLimit(admin, `authoring:export:${user.id}`, RENDUS_MAX, RENDUS_FENETRE))) {
    return erreurAvecLangue(lang, "api.rate.limited", 429);
  }

  // Relu sous le JWT : la RLS de 0141 cache le projet d'un autre (404).
  const [{ data: ligne, error: erreurLecture }, { data: profil }] = await Promise.all([
    supabase
      .from(TABLE_PROJETS)
      .select("id, titre, langue, contenu, revision, plan_approuve_revision, revision_approuvee, archived_at")
      .eq("id", id)
      .maybeSingle(),
    supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle(),
  ]);
  if (erreurLecture) return erreurAvecLangue(lang, "api.unavailable", 503);
  const projet = projetPourEditeur(ligne);
  if (!projet) return erreurAvecLangue(lang, "authoring.introuvable", 404);
  if (projet.archive) return erreurAvecLangue(lang, "authoring.archive", 409, { code: "archive" });
  if (projet.revision !== revision) return erreurAvecLangue(lang, "authoring.conflit", 409, { code: "conflit" });
  if (projet.revisionApprouvee !== projet.revision) {
    return erreurAvecLangue(lang, "authoring.export.nonApprouve", 409, { code: "authoring_guide_non_approuve" });
  }
  // La fiche-test, refaite : rien ne part si un bloquant est apparu (texte écrit hors de l'écran).
  const fiche = ficheTest({ titre: projet.titre, contenu: projet.contenu, planApprouve: projet.planApprouveRevision !== null });
  if (fiche.bloquants > 0) return erreurAvecLangue(lang, "authoring.approbation.pasPret", 422, { code: "guide_pas_pret", fiche });

  const auteur = typeof profil?.display_name === "string" ? profil.display_name : "";
  const guide = guidePourPdf(projet, auteur);
  const pdf = rendreGuidePdf(guide);
  const extrait = rendreExtraitPdf(guide);
  if (!pdf.ok || !extrait.ok) {
    const echec = !pdf.ok ? pdf : extrait.ok ? null : extrait;
    return erreurAvecLangue(lang, "authoring.export.rendu", 422, { code: echec?.code ?? "rendu" });
  }

  // Chemins adressés par le contenu : un même chemin porte toujours les mêmes octets.
  const fichiers = [
    { chemin: cheminExport(user.id, id, pdf.empreinte), octets: pdf.octets },
    { chemin: cheminExtrait(user.id, id, extrait.empreinte), octets: extrait.octets },
  ];
  for (const f of fichiers) {
    const { error } = await admin.storage
      .from(AUTHORING_BUCKET)
      .upload(f.chemin, f.octets, { contentType: "application/pdf", upsert: true, cacheControl: "0" });
    if (error) {
      console.error("[authoring] depot du PDF refuse");
      return erreurAvecLangue(lang, "api.write.failed", 502);
    }
  }

  const { data, error } = await admin
    .rpc("zabelie_authoring_enregistrer_export", {
      p_seller: user.id,
      p_projet: id,
      p_revision: projet.revision,
      p_moteur: MOTEUR_PDF,
      p_empreinte: pdf.empreinte,
      p_taille: pdf.octets.length,
      p_pages: pdf.pages,
      p_extrait_empreinte: extrait.empreinte,
      p_extrait_taille: extrait.octets.length,
      p_extrait_pages: extrait.pages,
    })
    .single();
  if (error) {
    const t = traduireErreurBase(error);
    if (t.statut === 500) console.error("[authoring] export non enregistre", error.code ?? "sans code");
    return erreurAvecLangue(lang, t.cle, t.statut, { code: t.code });
  }
  // La base a calculé le chemin de son côté : s'il diffère, on ne répond pas « prêt ».
  const enregistre = data as Record<string, unknown> | null;
  if (enregistre?.chemin !== fichiers[0].chemin || enregistre?.extrait_chemin !== fichiers[1].chemin) {
    console.error("[authoring] chemin d'export divergent");
    return erreurAvecLangue(lang, "api.write.failed", 500);
  }
  const sortie = exportPourClient(enregistre);
  if (!sortie) return erreurAvecLangue(lang, "api.write.failed", 500);
  return NextResponse.json({ export: sortie }, { status: 201, headers: ENTETES_PRIVEES });
}
