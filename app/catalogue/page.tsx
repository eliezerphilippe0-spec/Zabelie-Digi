import Link from "next/link";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { ProductCard } from "@/components/product-card";
import {
  getCatalogueCategories,
  getPublishedProductsPage,
  CATALOGUE_PAGE_SIZE,
  recordSearchMiss,
  searchFuzzyProductIds,
} from "@/lib/products";
import { sessionFingerprint } from "@/lib/search-demand";
import { headers } from "next/headers";
import { getCategoryFacets, productIdsInCategory } from "@/lib/taxonomy";
import { getLang } from "@/lib/i18n-server";
import { getZonesActives, libelleZone, type Zone } from "@/lib/zones";
import { isSupabaseConfigured } from "@/lib/products";
import { isPrefetch, logLanding } from "@/lib/metrics";
import { t } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Catalogue — Zabelie",
};

// Les puces viennent des produits RÉELLEMENT publiés, plus d'une liste en dur :
// celle-ci ne connaissait que les six libellés digitaux, donc aucune ne pouvait
// atteindre un produit physique — rangé sous son département (« Auto & Moto »).
// Il n'apparaissait que sous « Tout » et disparaissait dès qu'on filtrait.

export default async function CataloguePage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    cat?: string;
    sous?: string;
    page?: string;
    zd?: string;
    zk?: string;
    zq?: string;
  }>;
}) {
  const { q, cat, sous, page: pageRaw, zd, zk, zq } = await searchParams;
  const activeCat = cat ?? "Tout";
  const page = Math.max(1, Number.parseInt(pageRaw ?? "1", 10) || 1);
  const [lang, categories, zones] = await Promise.all([
    getLang(),
    getCatalogueCategories(),
    isSupabaseConfigured() ? getZonesActives() : Promise.resolve([] as Zone[]),
  ]);

  // PR-Z3 (docs/33 §4) : la zone active est la plus PROFONDE choisie —
  // katye > komin > depatman — APRÈS validation de cohérence : la cascade
  // GET sans JS laisse un `zk`/`zq` périmé survivre à un changement de `zd`
  // dans la même soumission ; un enfant qui n'appartient pas au parent
  // soumis est simplement IGNORÉ, jamais filtré à contresens.
  const zkValide = zk && zones.some((z) => z.id === zk && z.parent_id === zd) ? zk : undefined;
  const zqValide = zq && zones.some((z) => z.id === zq && z.parent_id === zkValide) ? zq : undefined;
  const zoneId = zqValide || zkValide || zd || undefined;

  // Le second niveau se résout AVANT la requête catalogue : il la restreint.
  const productIds = sous ? await productIdsInCategory(sous) : null;
  const { items: products, hasMore, total, totalExact } = await getPublishedProductsPage({
    q,
    category: activeCat,
    page,
    productIds: productIds ?? undefined,
    zoneId,
  });

  // Les trois étages du sélecteur, depuis la même liste (34 lignes au
  // seed) : les komin du depatman choisi, les katye de la komin choisie.
  const depatmans = zones.filter((z) => z.level === "depatman");
  const komins = zd ? zones.filter((z) => z.level === "komin" && z.parent_id === zd) : [];
  const katyes = zkValide
    ? zones.filter((z) => z.level === "katye" && z.parent_id === zkValide)
    : [];
  const zoneActive = zoneId ? zones.find((z) => z.id === zoneId) : undefined;
  // Rayons fins du département actif. Vide hors département, et vide tant
  // qu'aucun produit publié n'y est rangé (V-13 : jamais un rayon désert).
  const facettes =
    activeCat !== "Tout" ? await getCategoryFacets(activeCat, lang) : [];

  // ── Couches 2 et 3 du capteur de demande (lot S) ─────────────────────────
  // Ordre voulu : la recherche littérale d'abord, le rattrapage ensuite, le
  // journal en dernier. Un terme n'est consigné comme MANQUANT que si les
  // deux couches ont échoué — sinon on irait recruter un vendeur pour un
  // produit qu'on a déjà, mal orthographié.
  let approchants: typeof products = [];
  let manque = false;
  if (q && products.length === 0) {
    const ids = await searchFuzzyProductIds(q);
    if (ids.length > 0) {
      approchants = (
        await getPublishedProductsPage({ productIds: ids, page: 1 })
      ).items;
    }
    if (approchants.length === 0) {
      manque = true;
      // Sans poivre serveur, `sessionFingerprint` rend `null` et on
      // N'ENREGISTRE PAS : un journal ré-identifiable serait pire que pas de
      // journal du tout. L'écran zéro-résultat, lui, s'affiche quand même.
      const empreinte = sessionFingerprint(await headers());
      if (empreinte) {
        // Best-effort et non bloquant : le capteur ne doit jamais faire
        // échouer la page qu'il observe.
        await recordSearchMiss({
          q,
          department: activeCat !== "Tout" ? activeCat : null,
          sessionHash: empreinte,
        });
      }
    }
  }
  // Mesure (journal Vercel, zéro PII — lib/metrics). Côté SERVEUR : la page
  // qui reçoit la navigation voit l'événement sans un octet de JS client. Le
  // garde préchargement évite de compter chaque survol de lien comme un clic.
  if (!(await isPrefetch())) {
    if (q) logLanding("search_submitted");
    if (activeCat !== "Tout") logLanding("category_clicked", { cat: activeCat });
    if (manque) logLanding("demand_sensor_submitted");
  }

  /* Le nombre de pages se DÉDUIT du total, il ne se compte pas à part : deux
     sources donneraient deux réponses le jour où l'une dérive. `max(1, …)`
     parce qu'un catalogue vide reste « page 1 sur 1 », jamais « sur 0 ». */
  const nbPages = Math.max(1, Math.ceil(total / CATALOGUE_PAGE_SIZE));

  const CATEGORIES = ["Tout", ...categories];
  // Filtre en cours = recherche OU catégorie. Sert à distinguer « rien ne
  // correspond » de « le catalogue est vide », qui appellent des réponses
  // opposées : reformuler d'un côté, publier de l'autre.
  const filtre = Boolean(q) || activeCat !== "Tout";

  // BL-134 (FRONT-19) : pagination par lien GET, 0 JS — préserve q/cat, change page.
  const hrefFor = (opts: { cat?: string; sous?: string | null; page?: number }) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    const c = opts.cat ?? activeCat;
    if (c !== "Tout") params.set("cat", c);
    // Changer de département invalide le rayon fin : `sous` appartient au
    // département courant, le garder afficherait un filtre impossible.
    const s2 = opts.sous === null ? undefined : (opts.sous ?? (opts.cat ? undefined : sous));
    if (s2) params.set("sous", s2);
    // La zone survit à la pagination et au changement de rayon : la perdre
    // en tournant la page serait un filtre qui se défait en silence. On ne
    // propage que les étages VALIDÉS — un enfant périmé meurt ici.
    if (zd) params.set("zd", zd);
    if (zkValide) params.set("zk", zkValide);
    if (zqValide) params.set("zq", zqValide);
    const p = opts.page ?? 1;
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return qs ? `/catalogue?${qs}` : "/catalogue";
  };
  const cardLabels = {
    kindFile: t(lang, "card.kind.file"),
    kindService: t(lang, "card.kind.service"),
    kindPhysical: t(lang, "card.kind.physical"),
    by: t(lang, "product.by"),
    sales: t(lang, "product.sales"),
    salesOne: t(lang, "product.sales.one"),
    lang,
  };
  const catHref = (c: string) => hrefFor({ cat: c, sous: null, page: 1 });
  const sousHref = (slug: string | null) => hrefFor({ sous: slug ?? undefined, page: 1 });

  return (
    <div className="bg-grain min-h-screen">
      <SiteNav />

      <section className="mx-auto max-w-6xl px-5 pb-10 pt-16">
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
          {t(lang, "catalog.title")}
        </h1>
        <p className="mt-2 text-sm text-mist">
          {totalExact ? total : `≥ ${total}`} {t(lang, "catalog.results")}
          {q ? ` ${t(lang, "catalog.for")} « ${q} »` : ""}
          {activeCat !== "Tout" ? ` · ${activeCat}` : ""}
          {sous ? ` · ${facettes.find((f) => f.slug === sous)?.label ?? sous}` : ""}
          {zoneActive ? ` · ${libelleZone(zoneActive, lang)}` : ""}.
        </p>

        {/* ── CE QUE L'ÉTOILE VEUT DIRE ICI ───────────────────────────────
            Ajouté le 2026-08-27, après avoir regardé ce que font Mercado
            Libre, Jumia et Amazon.

            Les trois exposent le COMPORTEMENT du vendeur, jamais son
            identité : thermomètre et médailles MercadoLíder sur les commandes
            honorées, Seller Score de Jumia sur quatre critères de service,
            badge « Achat vérifié » d'Amazon qui exige que l'avis vienne du
            compte qui a payé. Le KYC y est une condition d'ENTRÉE, pas un
            badge — et un badge d'identité ne dit rien à l'acheteur sur ce qui
            va lui arriver.

            Zabelie tient déjà le mécanisme d'Amazon, en plus strict et EN
            BASE : `0008` pose `order_id not null unique` — un avis exige une
            commande PAYÉE, un seul par commande. Ce n'est pas une politique de
            modération, c'est une contrainte Postgres.

            Ce qui manquait n'était donc pas la garantie, c'était de la DIRE :
            dans le catalogue, une note s'affichait comme une étoile ordinaire.

            ⚠️ ET LA LIGNE NE S'AFFICHE QUE S'IL Y A UNE ÉTOILE À EXPLIQUER.
            Expliquer un symbole absent de l'écran, c'est le motif « un filet
            sur un chemin impraticable » de CLAUDE.md, transposé à une phrase :
            elle rendrait toujours quelque chose, et n'informerait personne. */}
        {products.some((p) => p.ratingAvg !== null) && (
          <p className="mt-1 flex items-start gap-1.5 text-xs text-mist">
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
              className="mt-0.5 h-3.5 w-3.5 flex-none fill-none stroke-success"
              strokeWidth="1.8"
            >
              <path d="M5 12l4.5 4.5L19 7" />
            </svg>
            {t(lang, "catalog.reviews.proof")}
          </p>
        )}

        {/* Recherche (GET, fonctionne sans JS) */}
        <form action="/catalogue" className="mt-6 flex gap-2">
          {activeCat !== "Tout" && (
            <input type="hidden" name="cat" value={activeCat} />
          )}
          {zd && <input type="hidden" name="zd" value={zd} />}
          {zkValide && <input type="hidden" name="zk" value={zkValide} />}
          {zqValide && <input type="hidden" name="zq" value={zqValide} />}
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder={t(lang, "catalog.search.ph")}
            className="min-w-0 flex-1 rounded-xl border border-line bg-ink/40 px-4 py-3 text-sm outline-none focus:border-violet"
          />
          <button
            type="submit"
            /* PRIMAIRE : c'est l'action de CETTE page. Le crème filled
               était un troisième style de bouton pour une action de premier
               plan — ni l'accent, ni un contour. */
            className="rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-on-brand transition hover:opacity-90"
          >
            {t(lang, "catalog.search.btn")}
          </button>
        </form>

        {/* Filtre par zone (PR-Z3, docs/33 §4) — GET, cascade SANS JS :
            choisir un étage recharge la page et révèle le suivant. Masqué
            tant que la table des zones est vide (démo, ou 0069 pas encore
            en base) — un sélecteur à une option n'est pas un filtre. */}
        {depatmans.length > 0 && (
          <form action="/catalogue" className="mt-4 flex flex-wrap items-center gap-2">
            {q && <input type="hidden" name="q" value={q} />}
            {activeCat !== "Tout" && <input type="hidden" name="cat" value={activeCat} />}
            {sous && <input type="hidden" name="sous" value={sous} />}
            <label className="text-sm text-mist" htmlFor="zone-zd">
              {t(lang, "zone.filter.title")}
            </label>
            <select
              id="zone-zd"
              name="zd"
              defaultValue={zd ?? ""}
              aria-label={t(lang, "zone.level.depatman")}
              className="rounded-xl border border-line bg-ink/40 px-3 py-2 text-sm outline-none focus:border-violet"
            >
              <option value="">{t(lang, "zone.filter.all")}</option>
              {depatmans.map((z) => (
                <option key={z.id} value={z.id}>
                  {libelleZone(z, lang)}
                </option>
              ))}
            </select>
            {komins.length > 0 && (
              <select
                name="zk"
                defaultValue={zkValide ?? ""}
                aria-label={t(lang, "zone.level.komin")}
                className="rounded-xl border border-line bg-ink/40 px-3 py-2 text-sm outline-none focus:border-violet"
              >
                <option value="">{t(lang, "zone.level.komin")}</option>
                {komins.map((z) => (
                  <option key={z.id} value={z.id}>
                    {libelleZone(z, lang)}
                  </option>
                ))}
              </select>
            )}
            {katyes.length > 0 && (
              <select
                name="zq"
                defaultValue={zqValide ?? ""}
                aria-label={t(lang, "zone.level.katye")}
                className="rounded-xl border border-line bg-ink/40 px-3 py-2 text-sm outline-none focus:border-violet"
              >
                <option value="">{t(lang, "zone.level.katye")}</option>
                {katyes.map((z) => (
                  <option key={z.id} value={z.id}>
                    {libelleZone(z, lang)}
                  </option>
                ))}
              </select>
            )}
            <button
              type="submit"
              className="rounded-xl border border-line px-4 py-2 text-sm font-semibold text-cloud transition hover:border-violet"
            >
              {t(lang, "zone.filter.apply")}
            </button>
          </form>
        )}

        {/* Filtres catégories — masqués tant qu'il n'y a rien à filtrer :
            une seule puce « Tout » n'est pas un filtre, c'est du décor. */}
        {categories.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <Link
              key={c}
              href={catHref(c)}
              className={`inline-flex min-h-11 items-center rounded-full border px-4 py-1.5 text-sm transition ${
                c === activeCat
                  ? "border-transparent bg-cloud text-ink"
                  : "border-line text-mist hover:border-violet/50 hover:text-cloud"
              }`}
            >
              {c}
            </Link>
          ))}
        </div>
        )}

        {/* Second niveau : les rayons du département actif. N'apparaît que
            s'il y a de quoi choisir — un seul rayon n'est pas une navigation,
            et zéro rayon ne doit rien afficher du tout (V-13). */}
        {facettes.length > 1 && (
          <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">
            <Link
              href={sousHref(null)}
              className={`rounded-full px-3 py-1 text-xs transition ${
                !sous ? "bg-cloud text-ink" : "text-mist hover:text-cloud"
              }`}
            >
              {t(lang, "catalog.allShelves")}
            </Link>
            {facettes.map((f) => (
              <Link
                key={f.slug}
                href={sousHref(f.slug)}
                className={`rounded-full px-3 py-1 text-xs transition ${
                  f.slug === sous ? "bg-cloud text-ink" : "text-mist hover:text-cloud"
                }`}
              >
                {f.label}{" "}
                <span className={f.slug === sous ? "text-ink/60" : "text-mist"}>
                  {f.count}
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="mx-auto max-w-6xl px-5 pb-16">
        {products.length === 0 && approchants.length > 0 ? (
          /* Couche 2 : rien d'exact, mais la similarité a rattrapé. On le DIT
             — présenter un approchant comme un résultat exact fait douter de
             tout le catalogue. */
          <>
            <p className="mb-4 rounded-xl border border-line bg-surface/40 px-4 py-3 text-sm text-mist">
              {t(lang, "catalog.fuzzy")}
            </p>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {approchants.map((p) => (
                <ProductCard key={p.slug} product={p} labels={cardLabels} />
              ))}
            </div>
          </>
        ) : products.length === 0 ? (
          page > 1 ? (
            /* PAGE HORS LIMITES — trouvé en PARCOURANT le catalogue, pas en
               le relisant : `/catalogue?page=3` sur un catalogue de deux pages
               affichait « le catalogue est encore vide », ce qui est FAUX, et
               sans aucun moyen de revenir — le pied de pagination vivait dans
               la branche « il y a des produits ». Un lien périmé, une URL
               retapée, et le visiteur était dans un cul-de-sac qui lui disait
               en plus que la boutique n'avait rien à vendre. */
            <div className="rounded-2xl border border-line bg-surface/40 p-10 text-center">
              <p className="text-base font-semibold text-cloud">
                {t(lang, "catalog.page404.t")}
              </p>
              <p className="mx-auto mt-2 max-w-md text-sm text-mist">
                {t(lang, "catalog.page404.b")}
              </p>
              <Link
                href={hrefFor({ page: 1 })}
                className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-brand px-6 text-sm font-semibold text-on-brand"
              >
                {t(lang, "catalog.page404.cta")}
              </Link>
            </div>
          ) : manque ? (
            /* L'écran qui EST le produit du lot S. Trois éléments, dans cet
               ordre : ce qui a été cherché, où regarder à côté, et le seul
               geste qui change quelque chose — dire qu'on connaît un vendeur.
               L'acheteur déçu devient le canal de recrutement. */
            <div className="rounded-2xl border border-line bg-surface/40 p-8 text-center">
              <p className="text-base font-semibold text-cloud">
                {t(lang, "catalog.miss.title")} « {q} »
              </p>
              <p className="mx-auto mt-2 max-w-md text-sm text-mist">
                {t(lang, "catalog.miss.body")}
              </p>

              {facettes.length > 0 && (
                <div className="mt-6">
                  <p className="text-xs uppercase tracking-wide text-mist">
                    {t(lang, "catalog.miss.shelves")}
                  </p>
                  <div className="mt-2 flex flex-wrap justify-center gap-2">
                    {facettes.slice(0, 6).map((f) => (
                      <Link
                        key={f.slug}
                        href={`/catalogue?cat=${encodeURIComponent(activeCat)}&sous=${f.slug}`}
                        className="rounded-full border border-line px-3 py-1 text-xs text-mist hover:text-cloud"
                      >
                        {f.label} {f.count}
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              <p className="mt-6 text-sm text-cloud">{t(lang, "catalog.miss.know")}</p>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(
                  `Zabelie: ${q}`
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-block rounded-xl bg-brand px-6 py-3 text-sm font-semibold text-on-brand"
              >
                {t(lang, "catalog.miss.share")}
              </a>
            </div>
          ) : filtre && !q ? (
            /* Rayon filtré, AUCUNE recherche : c'est l'atterrissage des cartes
               de la grille d'accueil et des liens du menu. « Aucun résultat +
               réinitialiser » n'aurait aucun sens — il n'y a rien à
               reformuler. On dit la vérité utile : le rayon est ouvert, les
               premiers vendeurs s'installent, la place est libre. Aucun état
               vide muet (landing v2). */
            <div className="rounded-2xl border border-line bg-surface/40 p-10 text-center">
              <p className="text-base font-semibold text-cloud">
                {t(lang, "catalog.cat0.t")} — {sous ? facettes.find((f) => f.slug === sous)?.label ?? activeCat : activeCat}
              </p>
              <p className="mx-auto mt-2 max-w-md text-sm text-mist">
                {t(lang, "catalog.cat0.b")}
              </p>
              <Link
                href="/vendre"
                className="mt-5 inline-block rounded-xl bg-brand px-6 py-3 text-sm font-semibold text-on-brand"
              >
                {t(lang, "catalog.empty.cta")}
              </Link>
              <p className="mt-4 text-sm">
                <Link href="/catalogue" className="text-mist underline hover:text-cloud">
                  {t(lang, "catalog.reset")}
                </Link>
              </p>
            </div>
          ) : filtre ? (
            <div className="rounded-2xl border border-line bg-surface/40 p-10 text-center text-sm text-mist">
              {t(lang, "catalog.none")}{" "}
              <Link href="/catalogue" className="text-cloud underline">
                {t(lang, "catalog.reset")}
              </Link>
            </div>
          ) : (
            /* Catalogue vide — V-13 : l'état vide devait être utilisable avant
               qu'on touche à la barre de catégories. Un « aucun résultat »
               suivi d'un lien « réinitialiser » n'a aucun sens ici : il n'y a
               rien à réinitialiser, et la seule action utile est de publier. */
            <div className="rounded-2xl border border-line bg-surface/40 p-10 text-center">
              <p className="text-base font-semibold text-cloud">
                {t(lang, "catalog.empty.title")}
              </p>
              <p className="mx-auto mt-2 max-w-md text-sm text-mist">
                {t(lang, "catalog.empty.body")}
              </p>
              <Link
                href="/vendre"
                className="mt-5 inline-block rounded-xl bg-brand px-6 py-3 text-sm font-semibold text-on-brand"
              >
                {t(lang, "catalog.empty.cta")}
              </Link>
            </div>
          )
        ) : (
          <>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {products.map((p) => (
                <ProductCard
                  key={p.slug}
                  product={p}
                  labels={{
                    kindFile: t(lang, "card.kind.file"),
                    kindService: t(lang, "card.kind.service"),
                    kindPhysical: t(lang, "card.kind.physical"),
                    by: t(lang, "product.by"),
                    sales: t(lang, "product.sales"),
                    salesOne: t(lang, "product.sales.one"),
                    lang,
                  }}
                />
              ))}
            </div>
            {(hasMore || page > 1) && (
              /* PIED DE PAGINATION (2026-08-17). Il n'y avait qu'un « Voir
                 plus » : arrivé page 3, le visiteur ne savait ni où il était
                 ni comment revenir. Trois éléments, tous en liens GET — ça
                 marche sans JavaScript, comme le reste du catalogue. */
              <nav className="mt-10 flex items-center justify-center gap-3 text-sm">
                {page > 1 ? (
                  <Link
                    href={hrefFor({ page: page - 1 })}
                    className="inline-flex min-h-11 items-center rounded-xl border border-line bg-surface/60 px-5 font-semibold text-cloud transition hover:border-violet/50"
                  >
                    {t(lang, "catalog.prev")}
                  </Link>
                ) : null}
                <span className="numeric text-mist">
                  {t(lang, "catalog.pageOf")
                    .replace("{n}", String(page))
                    .replace("{total}", String(nbPages))}
                </span>
                {hasMore ? (
                  <Link
                    href={hrefFor({ page: page + 1 })}
                    className="inline-flex min-h-11 items-center rounded-xl border border-line bg-surface/60 px-5 font-semibold text-cloud transition hover:border-violet/50"
                  >
                    {t(lang, "catalog.more")}
                  </Link>
                ) : null}
              </nav>
            )}
          </>
        )}
      </section>

      <SiteFooter />
    </div>
  );
}
