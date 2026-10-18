import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireActiveAccount } from "@/lib/auth";
import { rateLimit } from "@/lib/zabelie-rate-limit";
import { getLang } from "@/lib/i18n-server";
import { erreurAvecLangue } from "@/lib/api-erreur";
import { UUID_RE, MAX_DIGITAL_FILES } from "@/lib/digital-studio";
import { AUTHORING_BUCKET, DIGITAL_BUCKET } from "@/lib/storage-buckets";
import { KIND_FILE } from "@/lib/product-kind";
import { creerBrouillonProduit } from "@/lib/product-draft";
import { confirmerLivrable } from "@/lib/product-asset-confirm";
import { creationActive, lireEnvCreation } from "@/lib/digital-authoring/flags";
import { ENTETES_PRIVEES, TABLE_PROJETS, projetPourEditeur } from "@/lib/digital-authoring/api";
import { TABLE_EXPORTS } from "@/lib/digital-authoring/export";
import {
  COLONNE_LIEN,
  COLONNES_EXPORT_SOUMISSION,
  SOUMISSIONS_FENETRE,
  SOUMISSIONS_MAX,
  cheminLivrable,
  descriptionDepuisGuide,
  detailsDepuisGuide,
  studioDepuisGuide,
  empreinteOctets,
  exportSoumettable,
  fichePourClient,
  lireEntreeSoumission,
  nomDeFichier,
} from "@/lib/digital-authoring/soumission";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Contexte = { params: Promise<{ id: string }> };

/** Une réponse de refus, rendue privée : elle peut nommer l'état d'une fiche. */
function prive(reponse: Response): Response {
  reponse.headers.set("Cache-Control", ENTETES_PRIVEES["Cache-Control"]);
  return reponse;
}

/**
 * POST /api/digital-authoring/projects/[id]/soumission
 *      { export, prix, rayon, sousRayon?, attestation }
 *
 * « Soumettre à la revue » (tâche 5.2 ; docs/70 §8). Dans l'ordre :
 *   1. relit sous le JWT le projet, l'export désigné et la fiche déjà
 *      rattachée — la RLS rend ceux d'un autre vendeur INTROUVABLES (T03) ;
 *   2. crée la fiche par la fonction partagée de `app/api/products` (mêmes
 *      règles que `/vendre`), avec le lien vers le projet. L'index unique de
 *      0148 fait de l'insertion la garantie d'UNE fiche par projet (T19) :
 *      la soumission perdante retrouve la fiche de la gagnante ;
 *   3. recopie le PDF approuvé, octets vérifiés contre l'empreinte approuvée,
 *      au chemin déterministe sous la fiche, puis le confirme par la logique
 *      de `app/api/products/asset`. Une reprise après panne retombe sur le
 *      même objet et la même ligne (T20) ;
 *   4. pré-remplit les détails et l'atelier numériques de la fiche (5.3),
 *      seulement s'ils manquent.
 *
 * Rien n'est publié : la fiche reste en brouillon, et une fiche sans livrable
 * ne peut pas être mise en vente (`/api/admin/product-status`). Une fiche
 * déjà publiée ou retirée n'est pas touchée d'ici.
 *
 * Décision C1-A : la clé de service ne sert qu'au limiteur, à la lecture et à
 * l'écriture des octets, et aux écritures que la création partagée faisait
 * déjà — toujours APRÈS le contrôle de session et la relecture sous le JWT.
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

  let brut: unknown;
  try {
    brut = await req.json();
  } catch {
    return erreurAvecLangue(lang, "api.json.invalid", 400);
  }
  const entree = lireEntreeSoumission(brut);
  if (!entree) return erreurAvecLangue(lang, "api.params.invalid", 400);

  const admin = createAdminClient();
  if (!(await rateLimit(admin, `authoring:soumission:${user.id}`, SOUMISSIONS_MAX, SOUMISSIONS_FENETRE))) {
    return erreurAvecLangue(lang, "api.rate.limited", 429);
  }

  // ── 1. Relecture sous le JWT ───────────────────────────────────────────────
  const lireFiche = () =>
    supabase.from("products").select("id, slug, status").eq(COLONNE_LIEN, id).maybeSingle();
  const [{ data: ligneProjet, error: erreurProjet }, { data: ligneExport, error: erreurExport }, fiche0] = await Promise.all([
    supabase
      .from(TABLE_PROJETS)
      .select("id, titre, langue, brief, contenu, revision, plan_approuve_revision, revision_approuvee, archived_at")
      .eq("id", id)
      .maybeSingle(),
    supabase.from(TABLE_EXPORTS).select(COLONNES_EXPORT_SOUMISSION).eq("id", entree.exportId).eq("project_id", id).maybeSingle(),
    lireFiche(),
  ]);
  if (erreurProjet || erreurExport) return erreurAvecLangue(lang, "api.unavailable", 503);
  if (fiche0.error) {
    // 42703 : colonne inconnue, 0148 n'est pas appliquée. On le dit à l'exploitant, pas au vendeur.
    if (fiche0.error.code === "42703") console.error("[authoring] MIGRATION 0148 NON APPLIQUEE : soumission impossible");
    return erreurAvecLangue(lang, "api.unavailable", 503);
  }
  const projet = projetPourEditeur(ligneProjet);
  if (!projet) return erreurAvecLangue(lang, "authoring.introuvable", 404);
  if (projet.archive) return erreurAvecLangue(lang, "authoring.archive", 409, { code: "archive" });
  const choix = exportSoumettable(ligneExport, projet);
  if (!choix.ok) {
    if (choix.raison === "introuvable") return erreurAvecLangue(lang, "authoring.export.introuvable", 404);
    if (choix.raison === "perime") return erreurAvecLangue(lang, "authoring.export.perime", 409, { code: "authoring_export_perime" });
    return erreurAvecLangue(lang, "authoring.soumission.nonApprouve", 409, { code: "authoring_export_non_approuve" });
  }
  const exp = choix.export;

  // ── 2. La fiche : retrouvée, ou créée par la fonction partagée ──────────────
  let fiche = fiche0.data as { id: string; slug: string; status: string } | null;
  let creee = false;
  if (!fiche) {
    // Créer une fiche demande son prix et son rayon ; les retrouver, non.
    if (entree.prix === null || entree.rayon === null) return erreurAvecLangue(lang, "api.params.invalid", 400);
    const resultat = await creerBrouillonProduit({
      req,
      lang,
      supabase,
      user,
      body: {
        title: projet.titre,
        description: descriptionDepuisGuide(projet),
        kind: KIND_FILE,
        category: entree.rayon,
        categoryId: entree.sousRayon,
        priceHTG: entree.prix,
        policyAccepted: entree.attestation,
      },
      lienProjet: id,
    });
    if (resultat instanceof Response) {
      const corps = (await resultat.clone().json().catch(() => null)) as { code?: unknown } | null;
      if (corps?.code !== "authoring_deja_soumis") return prive(resultat);
      // Une soumission simultanée a gagné l'insertion : on reprend SA fiche.
      const relue = await lireFiche();
      if (relue.error || !relue.data) return erreurAvecLangue(lang, "api.write.failed", 500);
      fiche = relue.data as { id: string; slug: string; status: string };
    } else {
      fiche = resultat;
      creee = true;
    }
  }
  const sortie = fichePourClient(fiche);
  if (!sortie) return erreurAvecLangue(lang, "api.write.failed", 500);
  // Publiée ou retirée : la modération a déjà tranché, on ne change rien d'ici.
  if (fiche.status !== "draft") {
    return NextResponse.json({ fiche: sortie, depose: false }, { headers: ENTETES_PRIVEES });
  }

  // ── 3. Le livrable : le PDF approuvé, recopié tel quel ──────────────────────
  const ficheId = fiche.id;
  const chemin = cheminLivrable(user.id, ficheId, exp.empreinte);
  const [{ data: livrables, error: erreurLivrables }, { data: exportsProjet, error: erreurExports }] = await Promise.all([
    admin.from("product_assets").select("id, storage_path").eq("product_id", ficheId),
    supabase.from(TABLE_EXPORTS).select("empreinte").eq("project_id", id),
  ]);
  if (erreurLivrables || erreurExports) return erreurAvecLangue(lang, "api.unavailable", 503);
  // Les dépôts antérieurs de CE projet sous cette fiche : remplacés par le nouveau PDF.
  const cheminsDuProjet = new Set(
    (exportsProjet ?? [])
      .map((e) => (e as { empreinte?: unknown }).empreinte)
      .filter((e): e is string => typeof e === "string" && /^[0-9a-f]{64}$/.test(e))
      .map((e) => cheminLivrable(user.id, ficheId, e))
  );
  const lignes = (livrables ?? []) as { id: string; storage_path: string }[];
  const dejaLa = lignes.some((l) => l.storage_path === chemin);
  const autres = lignes.filter((l) => !cheminsDuProjet.has(l.storage_path));
  if (!dejaLa && autres.length >= MAX_DIGITAL_FILES) {
    return erreurAvecLangue(lang, "studio.fileLimit", 422, { fiche: sortie });
  }

  if (!dejaLa) {
    const { data: fichier, error: erreurLecture } = await admin.storage.from(AUTHORING_BUCKET).download(exp.chemin);
    if (erreurLecture || !fichier) {
      console.error("[authoring] PDF approuve illisible au stockage");
      return erreurAvecLangue(lang, "api.unavailable", 503, { fiche: sortie });
    }
    const octets = new Uint8Array(await fichier.arrayBuffer());
    // Les octets doivent être CEUX que le vendeur a approuvés (T28) : rien d'autre ne part en vente.
    if (empreinteOctets(octets) !== exp.empreinte) {
      console.error("[authoring] octets du PDF differents de l'empreinte approuvee");
      return erreurAvecLangue(lang, "authoring.soumission.octets", 409, { code: "authoring_octets_differents", fiche: sortie });
    }
    // Chemin adressé par le contenu : réécrire donne les mêmes octets (reprise T20).
    const { error: erreurDepot } = await admin.storage
      .from(DIGITAL_BUCKET)
      .upload(chemin, octets, { contentType: "application/pdf", upsert: true });
    if (erreurDepot) {
      console.error("[authoring] depot du livrable refuse");
      return erreurAvecLangue(lang, "api.write.failed", 502, { fiche: sortie });
    }
  }

  const confirmation = await confirmerLivrable({
    admin,
    lang,
    user,
    product: { id: ficheId },
    productId: ficheId,
    body: { path: chemin },
    safeName: nomDeFichier(projet.titre),
    ext: "pdf",
  });
  if (confirmation.status !== 200) return prive(confirmation);

  // L'ancien PDF de ce guide cède la place : la LIGNE seulement. L'objet reste au
  // stockage, comme pour tout remplacement de livrable (confirmation partagée).
  const remplaces = lignes.filter((l) => l.storage_path !== chemin && cheminsDuProjet.has(l.storage_path)).map((l) => l.id);
  if (remplaces.length > 0) {
    const { error: erreurRetrait } = await admin.from("product_assets").delete().eq("product_id", ficheId).in("id", remplaces);
    if (erreurRetrait) console.error("[authoring] ancien PDF non retire de la fiche");
  }

  // ── 4. L'atelier numérique pré-rempli (5.3), par ses contrats existants ─────
  // Insertion seulement si la ligne manque : une soumission suivante n'écrase
  // jamais ce que le vendeur a retouché. Un échec ne défait rien : il complète
  // alors sa fiche à la main, comme pour une fiche de `/vendre`.
  const details = detailsDepuisGuide(projet, exp.pages);
  const atelier = studioDepuisGuide(projet);
  const preremplissages = await Promise.all([
    details && admin.from("zabelie_digital_details").upsert({ product_id: ficheId, ...details }, { onConflict: "product_id", ignoreDuplicates: true }),
    atelier && admin.from("zabelie_digital_studio").upsert({ product_id: ficheId, ...atelier }, { onConflict: "product_id", ignoreDuplicates: true }),
  ]);
  if (!details || !atelier || preremplissages.some((r) => r && r.error)) console.error("[authoring] fiche non pre-remplie");

  return NextResponse.json({ fiche: sortie, depose: true }, { status: creee ? 201 : 200, headers: ENTETES_PRIVEES });
}
