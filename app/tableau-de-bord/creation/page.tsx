import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { AuthoringCreateForm } from "@/components/authoring-create-form";
import { StudioShell } from "@/components/studio-shell";
import { IconeStudio, type NomIcone } from "@/components/studio-icones";
import { Montant, MontantsMasquables } from "@/components/montants-masquables";
import { getCurrentUser, requireLegalAccountPage } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getLang } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";
import { choisirMoteur, creationActive, lireEnvCreation } from "@/lib/digital-authoring/flags";
import { copieCreation } from "@/lib/digital-authoring/copy";
import { copieVentes } from "@/lib/digital-authoring/copy-ventes";
import { COLONNES_RESUME, TABLE_CONFIG, TABLE_PROJETS } from "@/lib/digital-authoring/api";
import { IDS_MODELES } from "@/lib/digital-authoring/modeles";
import { chargerOpportunites, titreDepuisParametre } from "@/lib/digital-authoring/opportunites";
import {
  LOT_VENTES,
  LOTS_VENTES_MAX,
  chargerVentesDigitales,
  momentDeLaJournee,
  resumerVentes,
} from "@/lib/digital-authoring/ventes";
import { hrefBoutique } from "@/lib/boutique-href";
import { getBoutikSlug } from "@/lib/creators";
import { coverUrlAt } from "@/lib/product-image";
import { formatHTG } from "@/lib/sample-data";

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
const VIGNETTE = 160;

/**
 * /tableau-de-bord/creation — le tableau du Studio de création éditoriale
 * (tasks/plan.md, phases T et T2).
 *
 * Phase T (2026-10-16, « t'inspirer de Tunafrik, de CreateurSuite ») : un
 * menu, les projets à reprendre, les opportunités ; promesse de Tunafrik, le
 * savoir-faire devient un produit digital qui se vend, en trois étapes. Les
 * publicités sont abandonnées ; l'audio et la vidéo sont annoncés, jamais
 * proposés tant qu'ils n'existent pas.
 *
 * Phase T2 (2026-10-17, « inspire-toi de Chariow ») : la salutation selon
 * l'heure d'Haïti, une rangée d'actions rapides, trois chiffres en cartes
 * qu'on peut masquer, les produits les plus vendus. Chaque chiffre vient de
 * la base (`lib/digital-authoring/ventes.ts`) ; une lecture qui échoue le
 * dit au lieu d'afficher zéro. Tant qu'il n'y a aucune vente, les projets
 * passent AVANT les cartes : le tableau vendeur a la même règle, quatre zéros
 * en tête diraient l'échec avant de dire quoi faire.
 *
 * Drapeau éteint → 404. Projets, limites, compteur, opportunités et ventes
 * lus sous le JWT du vendeur (RLS de 0002 et 0141, fonctions de 0142 et 0143),
 * jamais par la clé de service. Le chemin est exclu du cache du service
 * worker (`^/tableau-de-bord`, lib/pwa-routes.ts).
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
  const v = copieVentes(lang);
  const locale = lang === "ht" ? "fr-HT" : lang;
  const ia = choisirMoteur(lireEnvCreation()).ok;
  const supabase = await createClient();
  const [{ data: lignes }, { data: config }, opportunites, quota, lecture, boutikSlug, { count: nbProduits }] =
    await Promise.all([
      supabase.from(TABLE_PROJETS).select(COLONNES_RESUME).order("updated_at", { ascending: false }).limit(100),
      supabase.from(TABLE_CONFIG).select("projets_actifs_max").maybeSingle(),
      chargerOpportunites(supabase, lang),
      ia
        ? supabase.rpc("zabelie_authoring_quota").maybeSingle<{ utilisees: number; maximum: number }>().then((r) => r.data)
        : Promise.resolve(null),
      chargerVentesDigitales(supabase, user.id),
      // L'adresse lisible (0083), par la fiche publique (0084) : `boutik_slug` n'est pas
      // accordé à la session sur `profiles`. Absente, `hrefBoutique` retombe sur /createur/<id>.
      getBoutikSlug(user.id),
      // Les codes promo vivent sur le tableau vendeur, qui ne les propose qu'à un vendeur ayant un produit.
      supabase.from("products").select("id", { count: "exact", head: true }).eq("seller_id", user.id),
    ]);
  const projets = (lignes ?? []) as unknown as Resume[];
  const actifs = projets.filter((p) => !p.archived_at).length;
  const max = typeof config?.projets_actifs_max === "number" ? config.projets_actifs_max : null;
  const plein = max !== null && actifs >= max ? t(lang, "authoring.projetsMax") : null;
  const ventes = lecture ? resumerVentes(lecture.lignes, new Date(), lecture.complet) : null;
  const boutique = hrefBoutique({ id: user.id, boutikSlug });

  const params = await searchParams;
  const depart = params.depart === "vide" || params.depart === "modele" ? params.depart : null;
  // « Partir d'un modèle » préremplit le premier modèle ; le vendeur en change.
  const modeleInitial = depart === "modele" ? IDS_MODELES[0] : null;
  const titreInitial = depart ? titreDepuisParametre(params.titre) : "";
  const tous = params.tous === "1";
  const visibles = tous ? projets : projets.slice(0, VISIBLES);

  const prenom = user.displayName.trim().split(/\s+/)[0]?.slice(0, 40) ?? "";
  const moment = momentDeLaJournee(new Date());
  const salut = prenom ? v.salut[moment].replace("{nom}", prenom) : v.salutSansNom[moment];
  const restantes = quota ? Math.max(0, quota.maximum - quota.utilisees) : null;
  const quotaCadre =
    quota && restantes !== null
      ? { restantes, maximum: quota.maximum, texte: c.ia.restantes.replace("{n}", String(restantes)).replace("{max}", String(quota.maximum)) }
      : null;

  const etat = (p: Resume) =>
    p.archived_at ? c.etatArchive : p.plan_approuve_revision ? c.etatPlan : c.etatBrouillon;
  const actions: { cle: string; href: string; texte: string; icone: NomIcone }[] = [
    { cle: "vide", href: "?depart=vide#nouveau-projet", texte: c.entreeVide, icone: "nouveau" },
    { cle: "modele", href: "?depart=modele#nouveau-projet", texte: c.entreeModele, icone: "modele" },
    { cle: "analyse", href: "/tableau-de-bord/creation/analyse", texte: tb.entreeAnalyse, icone: "analyse" },
    ...(nbProduits ? [{ cle: "promo", href: "/tableau-de-bord/codes-promo", texte: v.actionPromo, icone: "promo" as const }] : []),
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
        ...opportunites.ventes.map((o) => tb.oppVente.replace("{categorie}", o.rayon).replace("{n}", String(o.ventes))),
      ].slice(0, 3)
    : [];

  // Un total amputé se lit « ≥ », comme sur le tableau vendeur.
  const somme = (n: number) => (ventes && !ventes.complet ? `≥ ${formatHTG(n)}` : formatHTG(n));
  const cartes = ventes
    ? [
        { cle: "revenus", icone: "revenus" as const, valeur: somme(ventes.revenus), libelle: v.carteRevenus, note: v.carteRevenusNote },
        { cle: "7j", icone: "calendrier" as const, valeur: somme(ventes.revenus7j), libelle: v.carte7j, note: v.carte7jNote },
        {
          cle: "clients",
          icone: "clients" as const,
          valeur: String(ventes.clients),
          libelle: v.carteClients,
          note:
            ventes.ventes === 0
              ? v.carteClientsNote0
              : ventes.ventes === 1
                ? v.carteClientsNote1
                : v.carteClientsNote.replace("{n}", String(ventes.ventes)),
        },
      ]
    : [];
  const aVendu = (ventes?.ventes ?? 0) > 0;

  const blocVentes = (
    <section aria-labelledby="chiffres-titre" className="mt-8">
      <MontantsMasquables titre={v.chiffresTitre} masquer={v.masquer}>
        {ventes === null ? (
          <p role="status" className="mt-3 rounded-2xl border border-line p-5 text-sm text-mist">{v.indisponible}</p>
        ) : (
          <>
            {/* Téléphone : le revenu sur toute la largeur, les deux autres côte à côte
                (trois cartes empilées prenaient un écran entier). */}
            <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {cartes.map((k, i) => (
                <li key={k.cle} className={`rounded-2xl border border-line bg-surface p-4 sm:p-5 ${i === 0 ? "col-span-2 sm:col-span-1" : ""}`}>
                  <IconeStudio nom={k.icone} className="h-5 w-5 text-mist" />
                  <p className="metric mt-3 text-xl font-semibold tracking-tight tabular-nums sm:text-2xl">
                    <Montant valeur={k.valeur} masque={v.montantMasque} />
                  </p>
                  <p className="mt-1 text-sm font-medium">{k.libelle}</p>
                  <p className="mt-0.5 text-xs text-mist">{k.note}</p>
                </li>
              ))}
            </ul>
            {!ventes.complet && (
              <p className="mt-2 text-xs text-mist">{v.incomplet.replace("{n}", String(LOT_VENTES * LOTS_VENTES_MAX))}</p>
            )}

            <div className="mt-6 rounded-2xl border border-line">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
                <div>
                  <h3 className="font-semibold">{v.meilleursTitre}</h3>
                  <p className="text-xs text-mist">{v.meilleursSous}</p>
                </div>
                {aVendu && (
                  <Link href="/mes-ventes" className="bouton inline-flex min-h-11 items-center rounded-xl border border-line px-4 text-sm font-semibold">
                    {v.voirTout}
                  </Link>
                )}
              </div>
              {ventes.meilleurs.length === 0 ? (
                <p className="p-5 text-sm text-mist">{v.aucuneVente}</p>
              ) : (
                <ol className="divide-y divide-line">
                  {ventes.meilleurs.map((p) => {
                    const vignette = coverUrlAt(p.cover, VIGNETTE);
                    return (
                      <li key={p.id} className="flex items-center gap-3 px-5 py-3">
                        {vignette ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={vignette} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
                        ) : (
                          <span aria-hidden="true" className="grid h-12 w-12 shrink-0 place-items-center rounded-lg border border-line text-mist">
                            <IconeStudio nom="projets" />
                          </span>
                        )}
                        <div className="min-w-0 flex-1">
                          <Link href={`/produit/${p.slug}`} className="line-clamp-2 break-words font-medium hover:underline">{p.titre}</Link>
                          <p className="text-xs text-mist">{formatHTG(p.prix)}</p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-sm font-semibold tabular-nums"><Montant valeur={formatHTG(p.revenus)} masque={v.montantMasque} /></p>
                          <p className="text-xs text-mist">{p.ventes === 1 ? v.ventes1 : v.ventesN.replace("{n}", String(p.ventes))}</p>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          </>
        )}
      </MontantsMasquables>
    </section>
  );

  return (
    <>
      <SiteNav />
      <main id="main">
        <StudioShell labels={c} ventes={v} actif="accueil" retour={t(lang, "nav.dashboard")} quota={quotaCadre}>
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:justify-between">
            <div className="min-w-0 sm:flex-1">
              <h1 className="text-2xl font-semibold sm:text-3xl">{salut}</h1>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-mist">{c.intro}</p>
            </div>
            <Link href={boutique} className="bouton inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl border border-line px-4 text-sm font-semibold">
              <IconeStudio nom="boutique" />
              {v.voirBoutique}
            </Link>
          </div>

          <h2 id="actions-titre" className="mt-6 text-sm font-semibold">{c.titre}</h2>
          <ul aria-labelledby="actions-titre" className="mt-3 flex flex-wrap gap-2">
            {actions.map((a) => (
              <li key={a.cle}>
                <Link
                  href={a.href}
                  className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-surface px-4 text-sm font-medium hover:border-cloud focus-visible:outline focus-visible:outline-2"
                >
                  <IconeStudio nom={a.icone} className="h-5 w-5 text-brand" />
                  {a.texte}
                </Link>
              </li>
            ))}
          </ul>

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

          {aVendu && blocVentes}

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

          {!aVendu && blocVentes}
        </StudioShell>
      </main>
      <SiteFooter />
    </>
  );
}
