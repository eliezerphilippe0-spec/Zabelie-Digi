import Link from "next/link";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { VendeurShell } from "@/components/vendeur-shell";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { vendeurOuRedirection } from "@/lib/vendeur-acces";
import { LIMITE_VENTES_LUES, STATUTS_VENTE_REELLE, prenom, resumerClients, type LigneVente } from "@/lib/vendeur-clients";
import { LOCALE_DATE } from "@/lib/facturation-copy";
import { lireSignaux } from "@/lib/vendeur-signaux";
import { formatHTG } from "@/lib/sample-data";
import { getLang } from "@/lib/i18n-server";
import { t, tn } from "@/lib/i18n";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mes clients — Zabelie", robots: { index: false, follow: false } };

/**
 * /tableau-de-bord/clients — « Mes clients », en LECTURE SEULE (docs/75 §5.C,
 * PR-Z3 ; V-24). Aucune table client : tout se dérive des ventes réelles
 * (`lib/vendeur-clients.ts`). Aucun numéro, aucune adresse, aucun export : les
 * coordonnées d'un acheteur restent sur sa commande, dans « Mes ventes ».
 */
export default async function ClientsPage() {
  const user = await vendeurOuRedirection("/tableau-de-bord/clients");
  const lang = await getLang();

  /* Même lecture que les ventes de l'accueil et de l'API v1 : client service,
     filtre EXPLICITE sur le vendeur du produit (`!inner`), puis revérification
     ligne par ligne dans `resumerClients`. */
  const { data, error, count } = await createAdminClient()
    .from("orders")
    .select("buyer_id, product_id, amount_htg, status, zabelie_payment_is_live, created_at, products!orders_product_id_fkey!inner(seller_id, title)",
      { count: "exact" })
    .eq("products.seller_id", user.id)
    .in("status", [...STATUTS_VENTE_REELLE])
    .eq("zabelie_payment_is_live", true)
    .gt("amount_htg", 0)
    .order("created_at", { ascending: false })
    .range(0, LIMITE_VENTES_LUES - 1);

  const lignes = (data ?? []) as unknown as LigneVente[];
  const resume = error ? null : resumerClients(lignes, user.id, new Date());
  const partiel = !error && (count ?? 0) > lignes.length;

  /* Le prénom, et lui seul, quand la RLS le montre : CLIENT DE SESSION, c'est
     `zabelie_delivery_seller_read` (0076) qui décide (commande payée). Un
     service-role ici rendrait la policy décorative. Rien lu → « Client ». */
  const prenoms = new Map<string, string>();
  const acheteurs = resume?.clients.map((c) => c.buyerId) ?? [];
  if (acheteurs.length > 0) {
    const { data: livs } = await (await createClient())
      .from("zabelie_delivery_info")
      .select("user_id, full_name")
      .in("user_id", acheteurs);
    for (const l of (livs ?? []) as { user_id: string; full_name: string | null }[]) {
      const p = prenom(l.full_name);
      if (p) prenoms.set(l.user_id, p);
    }
  }
  const date = (iso: string) =>
    new Date(iso).toLocaleDateString(LOCALE_DATE[lang], { timeZone: "America/Port-au-Prince" });
  const commandes = (n: number) =>
    tn(lang, n, "vendeur.clients.commandes.one", "vendeur.clients.commandes", { n: String(n) });

  /* PR-Z4 (docs/75 §5.C) : signaux de demande. CLIENT DE SESSION — la fonction
     de 0156 raisonne sur auth.uid() et ne rend que des totaux. Fonction absente
     (0156 pas encore appliquée), erreur ou réponse hors schéma → section tue. */
  const { data: brut, error: signauxErr } = await (await createClient()).rpc("zabelie_vendeur_signaux");
  const signaux = signauxErr ? null : lireSignaux(brut);

  return (
    <div className="bg-grain min-h-dvh">
      <SiteNav />
      <main id="main">
        <VendeurShell lang={lang} actif="clients">
          <h1 className="text-2xl font-semibold sm:text-3xl">{t(lang, "vendeur.clients.titre")}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-mist">{t(lang, "vendeur.clients.intro")}</p>

          {!resume ? (
            <p role="alert" className="mt-6 text-sm text-danger-text">{t(lang, "vendeur.indisponible")}</p>
          ) : resume.clientsTotal === 0 ? (
            <div className="mt-6 rounded-2xl border border-line bg-surface p-5">
              <p className="text-sm leading-relaxed text-mist">{t(lang, "vendeur.clients.vide")}</p>
              <Link href="/tableau-de-bord/boutique#qr" className="bouton mt-4 inline-flex min-h-11 items-center rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-on-brand">
                {t(lang, "vendeur.action.partager")}
              </Link>
            </div>
          ) : (
            <>
              {partiel && <p className="mt-4 text-sm text-mist">{t(lang, "vendeur.clients.partiel", { n: String(LIMITE_VENTES_LUES) })}</p>}
              <dl id="chiffres-clients" className="mt-6 grid gap-3 sm:grid-cols-3">
                {([
                  ["vendeur.clients.k30", resume.clients30, null],
                  ["vendeur.clients.k90", resume.clients90, null],
                  ["vendeur.clients.revenus", resume.clientsRevenus, "vendeur.clients.revenus.aide"],
                ] as const).map(([cle, valeur, aide]) => (
                  <div key={cle} className="rounded-2xl border border-line bg-surface p-4">
                    <dt className="text-sm text-mist">{t(lang, cle)}</dt>
                    <dd className="mt-1 text-2xl font-semibold tabular-nums">{valeur}</dd>
                    {aide && <dd className="text-xs text-mist">{t(lang, aide)}</dd>}
                  </div>
                ))}
              </dl>

              <section aria-labelledby="top-produits" className="mt-8">
                <h2 id="top-produits" className="titre-section">{t(lang, "vendeur.clients.top")}</h2>
                <ol className="mt-3 divide-y divide-line rounded-2xl border border-line bg-surface">
                  {resume.produits.map((p) => (
                    <li key={p.productId} className="flex flex-wrap items-baseline justify-between gap-2 p-4">
                      <span className="min-w-0 break-words font-medium">{p.titre}</span>
                      <span className="text-sm text-mist tabular-nums">
                        {tn(lang, p.ventes, "vendeur.clients.ventes.one", "vendeur.clients.ventes", { n: String(p.ventes) })} · {formatHTG(p.montantHtg)}
                      </span>
                    </li>
                  ))}
                </ol>
              </section>

              <section aria-labelledby="liste-clients" className="mt-8">
                <h2 id="liste-clients" className="titre-section">{t(lang, "vendeur.clients.liste")}</h2>
                <ul className="mt-3 divide-y divide-line rounded-2xl border border-line bg-surface">
                  {resume.clients.map((c) => (
                    <li key={c.buyerId} className="flex flex-wrap items-baseline justify-between gap-2 p-4">
                      <span className="font-medium">{prenoms.get(c.buyerId) ?? t(lang, "vendeur.clients.anonyme")}</span>
                      <span className="text-sm text-mist tabular-nums">
                        {commandes(c.commandes)} · {formatHTG(c.montantHtg)} · {t(lang, "vendeur.clients.derniere", { date: date(c.derniere) })}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            </>
          )}

          {signaux && (
            <section id="signaux" aria-labelledby="signaux-titre" className="mt-10 scroll-mt-32">
              <h2 id="signaux-titre" className="titre-section">{t(lang, "vendeur.signaux.titre")}</h2>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-mist">{t(lang, "vendeur.signaux.intro")}</p>
              <dl className="mt-4 rounded-2xl border border-line bg-surface p-4">
                <dt className="text-sm text-mist">{t(lang, "vendeur.signaux.abonnes")}</dt>
                <dd className="mt-1 text-2xl font-semibold tabular-nums">{signaux.abonnes}</dd>
              </dl>

              <h3 className="mt-6 text-sm font-semibold">{t(lang, "vendeur.signaux.paniers")}</h3>
              {signaux.paniers.length === 0 ? (
                <p className="mt-2 text-sm text-mist">{t(lang, "vendeur.signaux.paniers.vide")}</p>
              ) : (
                <ul id="signaux-paniers" className="mt-2 divide-y divide-line rounded-2xl border border-line bg-surface">
                  {signaux.paniers.map((p, i) => (
                    <li key={i} className="flex flex-wrap items-baseline justify-between gap-2 p-4">
                      <span className="min-w-0 break-words font-medium">{p.titre}</span>
                      <span className="text-sm text-mist tabular-nums">
                        {p.moins_de_3 || p.paniers === null
                          ? t(lang, "vendeur.signaux.paniers.peu")
                          : t(lang, "vendeur.signaux.paniers.n", { n: String(p.paniers) })}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              <h3 className="mt-6 text-sm font-semibold">{t(lang, "vendeur.signaux.recherches")}</h3>
              {signaux.recherches.length === 0 ? (
                <p className="mt-2 text-sm text-mist">{t(lang, "vendeur.signaux.recherches.vide")}</p>
              ) : (
                <ul id="signaux-recherches" className="mt-2 divide-y divide-line rounded-2xl border border-line bg-surface">
                  {signaux.recherches.map((r) => (
                    <li key={r.terme} className="flex flex-wrap items-baseline justify-between gap-2 p-4">
                      <span className="min-w-0 break-words font-medium">
                        <q>{r.terme}</q>
                        {r.mon_rayon && <span className="ml-2 rounded-full border border-line px-2 py-0.5 text-xs text-mist">{t(lang, "vendeur.signaux.rayon")}</span>}
                      </span>
                      <span className="text-sm text-mist tabular-nums">{t(lang, "vendeur.signaux.recherches.n", { n: String(r.sessions) })}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </VendeurShell>
      </main>
      <SiteFooter />
    </div>
  );
}
