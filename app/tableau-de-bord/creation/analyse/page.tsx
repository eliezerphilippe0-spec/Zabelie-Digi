import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { StudioShell } from "@/components/studio-shell";
import { getCurrentUser, requireLegalAccountPage } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getLang } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";
import { creationActive, lireEnvCreation } from "@/lib/digital-authoring/flags";
import { copieCreation } from "@/lib/digital-authoring/copy";
import { chargerOpportunites, titreDepuisTerme } from "@/lib/digital-authoring/opportunites";

export const dynamic = "force-dynamic";
export const metadata = { title: "Zabelie", robots: { index: false, follow: false } };

/**
 * /tableau-de-bord/creation/analyse — « Analyser un marché » (tasks/plan.md,
 * tâche T.4 ; migration 0143). Ce que les gens cherchent sur Zabelie sans le
 * trouver, et les rayons où des produits digitaux se vendent : des chiffres
 * agrégés au-delà de seuils, lus sous le JWT du vendeur. Les seuils sont
 * affichés tels que la base les applique ; aucun chiffre n'est complété.
 */
export default async function AnalysePage() {
  if (!creationActive(lireEnvCreation())) notFound();
  const user = await getCurrentUser();
  if (!user) redirect("/connexion?next=/tableau-de-bord/creation/analyse");
  await requireLegalAccountPage(user.id, "/tableau-de-bord/creation/analyse");

  const lang = await getLang();
  const c = copieCreation(lang);
  const tb = c.tableau;
  const opp = await chargerOpportunites(await createClient(), lang);
  const nombre = new Intl.NumberFormat(lang === "ht" ? "fr-HT" : lang);

  return (
    <>
      <SiteNav />
      <main id="main">
        <StudioShell labels={c} actif="analyse" retour={t(lang, "nav.dashboard")} quota={null}>
          <h1 className="text-2xl font-semibold sm:text-3xl">{tb.analyseTitre}</h1>
          {opp === null ? (
            <p className="mt-4 text-sm text-mist">{tb.analyseIndisponible}</p>
          ) : (
            <>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-mist">{tb.analyseIntro.replace("{jours}", String(opp.jours))}</p>

              <section aria-labelledby="recherches-titre" className="mt-6 rounded-2xl border border-line p-5">
                <h2 id="recherches-titre" className="text-lg font-semibold">{tb.analyseRecherches}</h2>
                <p className="mt-1 text-sm text-mist">{tb.analyseRecherchesSous}</p>
                {opp.recherches.length === 0 ? (
                  <p className="mt-3 text-sm text-mist">{tb.oppVide}</p>
                ) : (
                  <ul className="mt-3 divide-y divide-line">
                    {opp.recherches.map((r) => (
                      <li key={r.terme} className="flex flex-wrap items-center justify-between gap-3 py-3">
                        <span className="min-w-0 break-words">
                          <span className="font-semibold">« {r.terme} »</span>
                          <span className="block text-xs text-mist">
                            {tb.analyseColPersonnes} : {nombre.format(r.personnes)}
                          </span>
                        </span>
                        <Link
                          href={`/tableau-de-bord/creation?depart=vide&titre=${encodeURIComponent(titreDepuisTerme(r.terme))}#nouveau-projet`}
                          className="bouton inline-flex min-h-11 items-center rounded-xl border border-line px-4 text-sm font-semibold"
                        >
                          {tb.oppEcrire}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section aria-labelledby="ventes-titre" className="mt-6 rounded-2xl border border-line p-5">
                <h2 id="ventes-titre" className="text-lg font-semibold">{tb.analyseVentes}</h2>
                <p className="mt-1 text-sm text-mist">{tb.analyseVentesSous}</p>
                {opp.ventes.length === 0 ? (
                  <p className="mt-3 text-sm text-mist">{tb.oppVide}</p>
                ) : (
                  <ul className="mt-3 divide-y divide-line">
                    {opp.ventes.map((v) => (
                      <li key={v.rayon} className="flex items-center justify-between gap-3 py-3">
                        <span className="min-w-0 break-words font-semibold">{v.rayon}</span>
                        <span className="shrink-0 text-sm text-mist">
                          {tb.analyseColVentes} : {nombre.format(v.ventes)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <p className="mt-6 max-w-2xl text-xs leading-relaxed text-mist">
                {tb.analyseConfidentialite
                  .replace("{sessions}", String(opp.seuils.personnes))
                  .replace("{ventes}", String(opp.seuils.ventes))
                  .replace("{vendeurs}", String(opp.seuils.vendeurs))}
              </p>
            </>
          )}
        </StudioShell>
      </main>
      <SiteFooter />
    </>
  );
}
