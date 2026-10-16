import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { AuthoringCreateForm } from "@/components/authoring-create-form";
import { StudioShell } from "@/components/studio-shell";
import { getCurrentUser, requireLegalAccountPage } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getLang } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";
import { choisirMoteur, creationActive, lireEnvCreation } from "@/lib/digital-authoring/flags";
import { copieCreation } from "@/lib/digital-authoring/copy";
import { COLONNES_RESUME, TABLE_CONFIG, TABLE_PROJETS } from "@/lib/digital-authoring/api";
import { IDS_MODELES } from "@/lib/digital-authoring/modeles";
import { chargerOpportunites, titreDepuisParametre } from "@/lib/digital-authoring/opportunites";

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

const VISIBLES = 5;

/**
 * /tableau-de-bord/creation — le tableau du Studio de création éditoriale
 * (tasks/plan.md, phase T ; demande du porteur du 2026-10-16 : « t'inspirer
 * de Tunafrik, de CreateurSuite pour construire ton tableau »).
 *
 * Disposition de CreateurSuite : un menu, « que voulez-vous faire
 * aujourd'hui ? », les entrées pour commencer, les projets à reprendre, les
 * opportunités. Promesse de Tunafrik : le savoir-faire devient un produit
 * digital qui se vend, en trois étapes. Les publicités sont abandonnées
 * (« on laisse tomber les pubs ») ; l'audio et la vidéo sont annoncés,
 * jamais proposés tant qu'ils n'existent pas.
 *
 * Drapeau éteint → 404. Projets, limites, compteur et opportunités lus sous
 * le JWT du vendeur (RLS de 0141, fonctions de 0142 et 0143), jamais par la
 * clé de service. Le chemin est exclu du cache du service worker
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
  const tb = c.tableau;
  const locale = lang === "ht" ? "fr-HT" : lang;
  const ia = choisirMoteur(lireEnvCreation()).ok;
  const supabase = await createClient();
  const [{ data: lignes }, { data: config }, opportunites, quota] = await Promise.all([
    supabase.from(TABLE_PROJETS).select(COLONNES_RESUME).order("updated_at", { ascending: false }).limit(100),
    supabase.from(TABLE_CONFIG).select("projets_actifs_max").maybeSingle(),
    chargerOpportunites(supabase, lang),
    ia
      ? supabase.rpc("zabelie_authoring_quota").maybeSingle<{ utilisees: number; maximum: number }>().then((r) => r.data)
      : Promise.resolve(null),
  ]);
  const projets = (lignes ?? []) as unknown as Resume[];
  const actifs = projets.filter((p) => !p.archived_at).length;
  const max = typeof config?.projets_actifs_max === "number" ? config.projets_actifs_max : null;
  const plein = max !== null && actifs >= max ? t(lang, "authoring.projetsMax") : null;

  const params = await searchParams;
  const depart = params.depart === "vide" || params.depart === "modele" ? params.depart : null;
  // « Partir d'un modèle » préremplit le premier modèle ; le vendeur en change.
  const modeleInitial = depart === "modele" ? IDS_MODELES[0] : null;
  const titreInitial = depart ? titreDepuisParametre(params.titre) : "";
  const tous = params.tous === "1";
  const visibles = tous ? projets : projets.slice(0, VISIBLES);

  const prenom = user.displayName.trim().split(/\s+/)[0]?.slice(0, 40) ?? "";
  const bonjour = prenom ? tb.bonjour.replace("{nom}", prenom) : tb.bonjourSansNom;
  const restantes = quota ? Math.max(0, quota.maximum - quota.utilisees) : null;
  const quotaCadre =
    quota && restantes !== null
      ? { restantes, maximum: quota.maximum, texte: c.ia.restantes.replace("{n}", String(restantes)).replace("{max}", String(quota.maximum)) }
      : null;

  const etat = (p: Resume) =>
    p.archived_at ? c.etatArchive : p.plan_approuve_revision ? c.etatPlan : c.etatBrouillon;
  const entrees = [
    { cle: "analyse", href: "/tableau-de-bord/creation/analyse", titre: tb.entreeAnalyse, desc: tb.entreeAnalyseDesc },
    { cle: "vide", href: "?depart=vide#nouveau-projet", titre: c.entreeVide, desc: c.entreeVideDesc },
    { cle: "modele", href: "?depart=modele#nouveau-projet", titre: c.entreeModele, desc: c.entreeModeleDesc },
  ];
  const formats = [
    { cle: "ebook", titre: tb.formatEbook, desc: tb.formatEbookDesc, actif: true },
    { cle: "audio", titre: tb.formatAudio, desc: tb.formatAudioDesc, actif: false },
    { cle: "video", titre: tb.formatVideo, desc: tb.formatVideoDesc, actif: false },
  ];
  const etapes = [
    { titre: tb.etape1Titre, texte: tb.etape1, bientot: false },
    { titre: tb.etape2Titre, texte: tb.etape2, bientot: false },
    // La mise en vente depuis le Studio, c'est la phase 5 : annoncée, pas promise.
    { titre: tb.etape3Titre, texte: tb.etape3, bientot: true },
  ];
  const apercu = opportunites
    ? [
        ...opportunites.recherches.map((r) => tb.oppRecherche.replace("{terme}", r.terme).replace("{n}", String(r.personnes))),
        ...opportunites.ventes.map((v) => tb.oppVente.replace("{categorie}", v.rayon).replace("{n}", String(v.ventes))),
      ].slice(0, 3)
    : [];

  return (
    <>
      <SiteNav />
      <main id="main">
        <StudioShell labels={c} actif="accueil" retour={t(lang, "nav.dashboard")} quota={quotaCadre}>
          <p className="text-sm text-mist">{bonjour}</p>
          <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">{c.titre}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-mist">{c.intro}</p>

          <section aria-labelledby="commencer-titre" className="mt-6 rounded-2xl border border-line bg-surface">
            <h2 id="commencer-titre" className="border-b border-line px-5 py-3 text-sm font-semibold">{tb.commencer}</h2>
            <ul className="grid divide-y divide-line sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              {entrees.map((e) => (
                <li key={e.cle}>
                  <Link href={e.href} className="flex h-full min-h-28 flex-col p-5 hover:bg-line/30 focus-visible:outline focus-visible:outline-2">
                    <span className="font-semibold">{e.titre}</span>
                    <span className="mt-1 text-sm text-mist">{e.desc}</span>
                    <span aria-hidden="true" className="mt-auto pt-3 text-brand">→</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          {depart && (
            <section id="nouveau-projet" aria-labelledby="nouveau-projet-titre" className="mt-6 scroll-mt-28 rounded-2xl border border-line bg-surface p-5">
              <h2 id="nouveau-projet-titre" className="text-lg font-semibold">{c.formTitre}</h2>
              <p className="mt-3 text-sm font-semibold">{tb.formatTitre}</p>
              <ul className="mt-2 grid gap-2 sm:grid-cols-3">
                {formats.map((f) => (
                  <li key={f.cle} className={`rounded-xl border p-3 text-sm ${f.actif ? "border-cloud" : "border-line text-mist"}`}>
                    <span className="flex items-center justify-between gap-2 font-semibold">
                      {f.titre}
                      <span className="rounded-full border border-line px-2 py-0.5 text-xs font-normal">
                        {f.actif ? `✓ ${tb.formatChoisi}` : tb.bientot}
                      </span>
                    </span>
                    <span className="mt-1 block text-xs">{f.desc}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-5 max-w-xl">
                <AuthoringCreateForm
                  key={`${depart}:${titreInitial}`}
                  labels={c}
                  modeleInitial={modeleInitial}
                  langueDefaut={lang === "fr" ? "fr" : "ht"}
                  titreInitial={titreInitial}
                  plein={plein}
                />
              </div>
            </section>
          )}

          <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_19rem]">
            <section id="mes-projets" aria-labelledby="mes-projets-titre" className="min-w-0 scroll-mt-28">
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
                  {visibles.map((p) => (
                    <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                      <div className="min-w-0">
                        <p className="break-words font-semibold">{p.titre}</p>
                        <p className="mt-1 text-xs text-mist">
                          {tb.formatEbook} · {p.langue === "ht" ? c.langueHt : c.langueFr} · {etat(p)} · {c.modifieLe}{" "}
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
              {!tous && projets.length > VISIBLES && (
                <Link href="?tous=1#mes-projets" className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold underline">
                  {tb.voirTous.replace("{n}", String(projets.length))}
                </Link>
              )}
            </section>

            <aside className="min-w-0 space-y-6">
              <section aria-labelledby="opp-titre" className="rounded-2xl border border-line p-5">
                <h2 id="opp-titre" className="text-lg font-semibold">{tb.oppTitre}</h2>
                <p className="mt-1 text-xs text-mist">{tb.oppSous}</p>
                {opportunites === null ? (
                  <p className="mt-3 text-sm text-mist">{tb.analyseIndisponible}</p>
                ) : apercu.length === 0 ? (
                  <p className="mt-3 text-sm text-mist">{tb.oppVide}</p>
                ) : (
                  <ul className="mt-3 space-y-2 text-sm">
                    {apercu.map((ligne) => (
                      <li key={ligne} className="break-words">{ligne}</li>
                    ))}
                  </ul>
                )}
                <Link href="/tableau-de-bord/creation/analyse" className="bouton mt-4 inline-flex min-h-11 items-center rounded-xl border border-line px-4 text-sm font-semibold">
                  {tb.oppVoir} <span aria-hidden="true">&nbsp;→</span>
                </Link>
              </section>

              <section aria-labelledby="comment-titre" className="rounded-2xl border border-line p-5">
                <h2 id="comment-titre" className="text-lg font-semibold">{tb.commentTitre}</h2>
                <ol className="mt-3 space-y-3 text-sm">
                  {etapes.map((e, i) => (
                    <li key={e.titre} className="flex gap-3">
                      <span aria-hidden="true" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-line text-xs font-semibold">{i + 1}</span>
                      <span className="min-w-0">
                        <span className="font-semibold">{e.titre}</span>
                        {e.bientot && <span className="ml-2 rounded-full border border-line px-2 py-0.5 text-xs text-mist">{tb.bientot}</span>}
                        <span className="mt-0.5 block text-mist">{e.texte}</span>
                      </span>
                    </li>
                  ))}
                </ol>
              </section>
            </aside>
          </div>
        </StudioShell>
      </main>
      <SiteFooter />
    </>
  );
}
