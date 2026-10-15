import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { AuthoringEditor } from "@/components/authoring-editor";
import { getCurrentUser, requireLegalAccountPage } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getLang } from "@/lib/i18n-server";
import { UUID_RE } from "@/lib/digital-studio";
import { creationActive, lireEnvCreation } from "@/lib/digital-authoring/flags";
import { copieCreation } from "@/lib/digital-authoring/copy";
import { TABLE_CONFIG, TABLE_PROJETS, limitesDepuisConfig, projetPourEditeur } from "@/lib/digital-authoring/api";
import { LIMITES_DEFAUT } from "@/lib/digital-authoring/schema";

export const dynamic = "force-dynamic";
export const metadata = { title: "Zabelie", robots: { index: false, follow: false } };

/**
 * /tableau-de-bord/creation/[projectId] — l'éditeur d'un projet (docs/70,
 * tâche 2.4). Lu sous le JWT du vendeur : la RLS de 0141 rend le projet d'un
 * autre INTROUVABLE, donc 404 — la page ne confirme jamais qu'il existe.
 * Les limites affichées viennent de la config en base ; à défaut, celles du
 * PRD, à titre indicatif seulement : le serveur reste l'autorité.
 */
export default async function ProjetPage({ params }: { params: Promise<{ projectId: string }> }) {
  if (!creationActive(lireEnvCreation())) notFound();
  const { projectId } = await params;
  if (!UUID_RE.test(projectId)) notFound();
  const user = await getCurrentUser();
  if (!user) redirect(`/connexion?next=${encodeURIComponent(`/tableau-de-bord/creation/${projectId}`)}`);
  await requireLegalAccountPage(user.id, `/tableau-de-bord/creation/${projectId}`);

  const lang = await getLang();
  const c = copieCreation(lang);
  const supabase = await createClient();
  const [{ data: ligne }, { data: config }] = await Promise.all([
    supabase.from(TABLE_PROJETS).select("*").eq("id", projectId).maybeSingle(),
    supabase.from(TABLE_CONFIG).select("*").maybeSingle(),
  ]);
  const projet = projetPourEditeur(ligne);
  if (!projet) notFound();

  return (
    <>
      <SiteNav />
      <main id="main" className="mx-auto max-w-3xl px-4 py-8">
        <Link href="/tableau-de-bord/creation" className="inline-flex min-h-11 items-center text-sm text-mist underline">
          ← {c.editeur.retour}
        </Link>
        <p className="mt-2 text-sm text-mist">{c.lien}</p>
        <h1 className="mt-1 break-words text-2xl font-semibold">{projet.titre}</h1>
        <div className="mt-6">
          <AuthoringEditor initial={projet} labels={c} limites={limitesDepuisConfig(config) ?? LIMITES_DEFAUT} />
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
