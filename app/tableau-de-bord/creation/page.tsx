import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { AuthoringCreateForm } from "@/components/authoring-create-form";
import { getCurrentUser, requireLegalAccountPage } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { studioProvider } from "@/lib/studio-server";
import { getLang } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";
import { creationActive, lireEnvCreation } from "@/lib/digital-authoring/flags";
import { copieCreation } from "@/lib/digital-authoring/copy";
import { COLONNES_RESUME, TABLE_CONFIG, TABLE_PROJETS } from "@/lib/digital-authoring/api";
import { IDS_MODELES } from "@/lib/digital-authoring/modeles";

export const dynamic = "force-dynamic";
export const metadata = { title: "Zabelie", robots: { index: false, follow: false } };

type Resume = {
  id: string;
  titre: string;
  langue: "ht" | "fr";
  plan_approuve_revision: number | null;
  archived_at: string | null;
  updated_at: string;
};

/**
 * /tableau-de-bord/creation — accueil du Studio de création éditoriale
 * (docs/70 §4, tâche 2.3 ; disposition validée le 2026-10-15, inspirée de
 * CreateurSuite : « que voulez-vous faire aujourd'hui ? », puis les projets
 * à reprendre).
 *
 * Drapeau éteint → 404 : la page n'existe pas plus que ses routes. Projets et
 * limites lus sous le JWT du vendeur (RLS de 0141), jamais par la clé de
 * service. Le chemin est déjà exclu du cache du service worker
 * (`^/tableau-de-bord`, lib/pwa-routes.ts).
 */
export default async function CreationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!creationActive(lireEnvCreation())) notFound();
  const user = await getCurrentUser();
  if (!user) redirect("/connexion?next=/tableau-de-bord/creation");
  await requireLegalAccountPage(user.id, "/tableau-de-bord/creation");

  const lang = await getLang();
  const c = copieCreation(lang);
  const locale = lang === "ht" ? "fr-HT" : lang;
  const supabase = await createClient();
  const [{ data: lignes }, { data: config }] = await Promise.all([
    supabase.from(TABLE_PROJETS).select(COLONNES_RESUME).order("updated_at", { ascending: false }).limit(100),
    supabase.from(TABLE_CONFIG).select("projets_actifs_max").maybeSingle(),
  ]);
  const projets = (lignes ?? []) as unknown as Resume[];
  const actifs = projets.filter((p) => !p.archived_at).length;
  const max = typeof config?.projets_actifs_max === "number" ? config.projets_actifs_max : null;
  const plein = max !== null && actifs >= max ? t(lang, "authoring.projetsMax") : null;

  // « Partir d'un modèle » préremplit le premier modèle ; le vendeur en change.
  const depart = (await searchParams).depart;
  const modeleInitial = depart === "modele" ? IDS_MODELES[0] : null;
  const pub = studioProvider() !== null;

  const etat = (p: Resume) =>
    p.archived_at ? c.etatArchive : p.plan_approuve_revision ? c.etatPlan : c.etatBrouillon;
  const carte = "flex min-h-24 flex-col rounded-2xl border border-line bg-surface p-4 hover:border-cloud focus-visible:outline focus-visible:outline-2";

  return (
    <>
      <SiteNav />
      <main id="main" className="mx-auto max-w-4xl px-4 py-8">
        <Link href="/tableau-de-bord" className="inline-flex min-h-11 items-center text-sm text-mist underline">
          ← {t(lang, "nav.dashboard")}
        </Link>
        <p className="mt-2 text-sm text-mist">{c.lien}</p>
        <h1 className="mt-1 text-2xl font-semibold">{c.titre}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-mist">{c.intro}</p>

        <ul className="mt-6 grid gap-3 sm:grid-cols-3">
          <li>
            <a href="?depart=vide#nouveau-projet" className={carte}>
              <span className="font-semibold">{c.entreeVide}</span>
              <span className="mt-1 text-sm text-mist">{c.entreeVideDesc}</span>
            </a>
          </li>
          <li>
            <a href="?depart=modele#nouveau-projet" className={carte}>
              <span className="font-semibold">{c.entreeModele}</span>
              <span className="mt-1 text-sm text-mist">{c.entreeModeleDesc}</span>
            </a>
          </li>
          {/* Même prédicat que le lien du tableau de bord et la page du Studio images. */}
          {pub && (
            <li>
              <Link href="/tableau-de-bord/studio" className={carte}>
                <span className="font-semibold">{c.entreePub}</span>
                <span className="mt-1 text-sm text-mist">{c.entreePubDesc}</span>
              </Link>
            </li>
          )}
        </ul>

        <section id="nouveau-projet" aria-labelledby="nouveau-projet-titre" className="mt-8 scroll-mt-28 rounded-2xl border border-line bg-surface p-5">
          <h2 id="nouveau-projet-titre" className="text-lg font-semibold">{c.formTitre}</h2>
          <div className="mt-4 max-w-xl">
            <AuthoringCreateForm key={modeleInitial ?? "vide"} labels={c} modeleInitial={modeleInitial} plein={plein} />
          </div>
        </section>

        <section aria-labelledby="mes-projets-titre" className="mt-8">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="mes-projets-titre" className="text-lg font-semibold">{c.projets}</h2>
            {max !== null && (
              <p className="text-xs text-mist">{c.actifs.replace("{n}", String(actifs)).replace("{max}", String(max))}</p>
            )}
          </div>
          <p className="mt-1 text-sm text-mist">{c.projetsSous}</p>
          {projets.length === 0 ? (
            <p className="mt-4 text-sm text-mist">{c.aucunProjet}</p>
          ) : (
            <ul className="mt-4 divide-y divide-line rounded-2xl border border-line">
              {projets.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="break-words font-semibold">{p.titre}</p>
                    <p className="mt-1 text-xs text-mist">
                      {p.langue === "ht" ? c.langueHt : c.langueFr} · {etat(p)} · {c.modifieLe}{" "}
                      {new Date(p.updated_at).toLocaleDateString(locale)}
                    </p>
                  </div>
                  <Link
                    href={`/tableau-de-bord/creation/${p.id}`}
                    className="bouton inline-flex min-h-11 items-center rounded-xl border border-line px-4 text-sm font-semibold"
                  >
                    {c.continuer} <span aria-hidden="true">&nbsp;→</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
