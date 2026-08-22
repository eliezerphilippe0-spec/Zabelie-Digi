import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { SignOutButton } from "@/components/sign-out-button";
import { LangToggle } from "@/components/lang-toggle";
import { ThemeToggle } from "@/components/theme-toggle";
import { CategoryMenu } from "@/components/category-menu";
import { SearchBox, type SearchSuggestion } from "@/components/search-box";
import { MetricA } from "@/components/metric-a";
import { getMenuRayons, type RayonMenu } from "@/lib/taxonomy";
import { whatsappHref } from "@/lib/whatsapp";
import { getCurrentUser } from "@/lib/auth";
import { getLang } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";

/**
 * Suggestions de recherche : les rayons actifs NON vides, à plat.
 *
 * Les rayons vides sont exclus à dessein — décision porteur 2026-08-02 : un
 * rayon désert n'est pas un lien, et une suggestion est un lien. À catalogue
 * vide la liste est donc vide et la recherche retombe sur son chemin GET
 * normal, dont l'écran zéro-résultat porte le capteur de demande : c'est
 * exactement la sortie prévue pour ce cas.
 */
function suggestionsDepuisRayons(rayons: RayonMenu[]): SearchSuggestion[] {
  const plat: SearchSuggestion[] = [];
  const visite = (r: RayonMenu) => {
    if (!r.vide) plat.push({ href: r.href, label: r.label });
    r.enfants.forEach(visite);
  };
  rayons.forEach(visite);
  return plat;
}

export async function SiteNav() {
  const [user, lang] = await Promise.all([getCurrentUser(), getLang()]);
  // Le menu vient de la BASE (`zabelie_categories`), jamais d'une liste écrite
  // en dur : c'est exactement ce que le constat UX-01 de la revue reprochait à
  // l'ancienne barre `PRODUCT_CATEGORIES`, dont les libellés sont des valeurs
  // stockées et donc intraduisibles.
  const rayons = await getMenuRayons(lang);
  const menuLabels = {
    title: t(lang, "menu.rayons"),
    empty: t(lang, "menu.empty"),
    all: t(lang, "menu.all"),
  };
  const wa = whatsappHref(t(lang, "wa.prefill"));

  /* Compteur du panier — lu avec le client de SESSION : la RLS de 0058 ne
   * rend que le panier de l'appelant, donc aucun filtre applicatif à écrire
   * (et aucun à oublier). `head: true` : on veut le nombre, pas les lignes.
   *
   * Erreur ou 0058 non appliquée → `null`, et l'icône se masque. Un panier
   * qui afficherait « 0 » alors que la table n'existe pas mentirait avec
   * aplomb ; absent, il ne dit rien. */
  let articlesPanier: number | null = null;
  if (user) {
    const { createClient: creerClientSession } = await import("@/lib/supabase/server");
    const sb = await creerClientSession();
    const { count, error: ePanier } = await sb
      .from("zabelie_cart_items")
      .select("id", { count: "exact", head: true });
    if (!ePanier) articlesPanier = count ?? 0;
  }

  return (
    /* ⚠️ COLLANT À PARTIR DE `md` SEULEMENT — mesuré le 2026-08-22.
     *
     * Cet en-tête fait **250 px de haut** à 360 px de large : barre
     * utilitaire, puis logo, puis recherche pleine largeur, puis la rangée
     * Catalogue · Talents · Aide. Collé en haut, il occupait donc **34 % d'un
     * écran de 740 px en permanence**, et davantage sur les téléphones plus
     * courts — c'est-à-dire le parc visé. Sur la fiche produit, la capture le
     * montrait sans discussion : l'acheteur voyait l'en-tête et un aplat de
     * couleur, le TITRE du produit était sous la ligne de flottaison.
     *
     * Sous `md`, l'en-tête défile donc avec la page. Le contenu récupère la
     * hauteur entière de l'écran, et remonter coûte un geste.
     *
     * ⚠️ Ce que ça COÛTE, et il faut le dire : la recherche n'est plus
     * atteignable en permanence sur mobile. C'est un arbitrage, pas une
     * amélioration gratuite. Il se défait en un mot — remettre `sticky` au
     * lieu de `md:sticky`. */
    <header className="z-50 md:sticky md:top-0">
      {/* TOPBAR — une ligne : l'entrée vendeur, le contact humain, la langue.
          Le CTA vendeur vit ICI désormais : toujours présent, jamais dominant
          — le hero appartient à l'acheteur. */}
      <div className="border-b border-line bg-ink/95 backdrop-blur">
        <div className="mx-auto flex min-h-11 max-w-6xl items-center justify-end gap-4 px-5 text-xs">
          {/* Le CTA vendeur a QUITTÉ la topbar (2026-08-09) : il vivait ici ET
              en ligne 2 depuis que la maquette l'y a fait descendre — donc deux
              fois à l'écran, à trois centimètres d'écart. Un même libellé à
              deux endroits n'est pas une insistance, c'est une hésitation
              visible. La topbar ne garde que la langue et le contact. */}
          <div className="flex items-center gap-4">
            {/* Masqué tant que le porteur n'a pas posé le numéro (env). */}
            {/* Masqué sous sm : à 360 px le libellé se replie sur trois
                lignes dans une barre de 36 px — la carte WhatsApp du rail
                d'accueil couvre le mobile. */}
            {wa && (
              <MetricA
                event="whatsapp_clicked"
                href={wa}
                className="hidden text-mist transition hover:text-cloud sm:block"
              >
                {t(lang, "wa.chat")}
              </MetricA>
            )}
            <ThemeToggle
              labelToLight={t(lang, "nav.theme.light")}
              labelToDark={t(lang, "nav.theme.dark")}
            />
            <LangToggle current={lang} />
          </div>
        </div>
      </div>

      <div className="mx-auto mt-3 max-w-6xl rounded-2xl glass px-5 py-3">
        <div className="flex items-center justify-between gap-4">
          <BrandLogo />

          {/* Recherche centrale — le premier outil de l'acheteur, dans
              l'en-tête et pas seulement dans le hero. Desktop seulement ici ;
              sous md elle a sa propre ligne plus bas (pleine largeur). */}
          <div className="hidden min-w-0 max-w-xl flex-1 md:block">
            <SearchBox
              compact
              placeholder={t(lang, "catalog.search.ph")}
              submitLabel={t(lang, "catalog.search.btn")}
              suggestionsLabel={t(lang, "search.sugg")}
              items={suggestionsDepuisRayons(rayons)}
            />
          </div>

          <div className="flex shrink-0 items-center gap-3">
            <Link
              href="/aide"
              className="hidden text-sm text-mist transition hover:text-cloud sm:block"
            >
              {t(lang, "nav.help")}
            </Link>
            {user ? (
              <>
                {user.role === "admin" && (
                  <Link
                    href="/admin"
                    className="hidden text-sm text-mist transition hover:text-cloud sm:block"
                  >
                    Admin
                  </Link>
                )}
                <Link
                  href="/tableau-de-bord"
                  className="hidden text-sm text-mist transition hover:text-cloud sm:block"
                >
                  {t(lang, "nav.dashboard")}
                </Link>
                <Link
                  href="/pro"
                  className="hidden text-sm text-mist transition hover:text-cloud sm:block"
                >
                  {t(lang, "nav.pro")}
                </Link>
                {/* Le vendeur d'un produit physique n'avait aucun endroit
                    où déclarer une remise. Sans ce lien, la page existerait
                    sans chemin pour y arriver — la même absence d'appelant que
                    celle que les croisements du dépôt traquent ailleurs. */}
                <Link
                  href="/mes-ventes"
                  className="hidden text-sm text-mist transition hover:text-cloud sm:block"
                >
                  {t(lang, "sales.title")}
                </Link>
                <SignOutButton
                  className="hidden text-sm text-mist transition hover:text-cloud sm:block"
                  label={t(lang, "nav.logout")}
                />
              </>
            ) : (
              <>
                <Link
                  href="/connexion"
                  className="hidden text-sm text-mist transition hover:text-cloud sm:block"
                >
                  {t(lang, "nav.login")}
                </Link>
              </>
            )}
          </div>
        </div>

        {/* Mobile : la recherche a droit à sa ligne entière — c'est l'outil
            n°1 sur le terrain visé, elle ne se partage pas avec le logo. */}
        <div className="mt-3 md:hidden">
          <SearchBox
            compact
            placeholder={t(lang, "catalog.search.ph")}
            submitLabel={t(lang, "catalog.search.btn")}
            suggestionsLabel={t(lang, "search.sugg")}
            items={suggestionsDepuisRayons(rayons)}
          />
        </div>

        {/* BL-104 (FRONT-16) : sous 768 px la nav md était MASQUÉE sans repli —
            Catalogue et Recharge devenaient inaccessibles depuis le header sur
            le terrain principal (Android). Repli en liens simples : 0 KB de JS,
            fonctionne sans hydratation sur bas de gamme (pattern Amazon mobile :
            les destinations vitales restent visibles). */}
        {/* Mobile : le menu des rayons ouvre en premier — c'est le geste de la
            maquette porteur, et le catalogue reste atteignable juste après. */}
        <div className="mt-2 flex items-center justify-center gap-5 border-t border-line pt-2 md:hidden">
          <CategoryMenu rayons={rayons} labels={menuLabels} />
          {/* RES-01 : `py-1` donnait 28 px de haut. Le seuil de 44 px n'est pas
              cosmétique, c'est la largeur d'un pouce — et cette barre est LA
              navigation du terrain visé (Android d'entrée de gamme). */}
          <nav className="flex items-center gap-4 text-sm text-mist">
            <Link
              href="/catalogue"
              className="inline-flex min-h-11 min-w-11 items-center justify-center px-1 transition hover:text-cloud"
            >
              {t(lang, "nav.catalog")}
            </Link>
            <Link
              href="/#talents"
              className="inline-flex min-h-11 min-w-11 items-center justify-center px-1 transition hover:text-cloud"
            >
              {t(lang, "nav.talents")}
            </Link>
            <Link
              href="/aide"
              className="inline-flex min-h-11 min-w-11 items-center justify-center px-1 transition hover:text-cloud"
            >
              {t(lang, "nav.help")}
            </Link>
            {/* La déconnexion vivait UNIQUEMENT en `sm:block` — donc invisible
                sur le format majoritaire du terrain visé. Or c'est exactement
                là qu'elle compte : Android partagé, cybercafé. Un formulaire,
                donc aucun JS requis. */}
            {user && (
              <SignOutButton
                label={t(lang, "nav.logout")}
                className="inline-flex min-h-11 min-w-11 items-center justify-center px-1 transition hover:text-cloud"
              />
            )}
          </nav>
        </div>

        {/* Desktop : rayons + repères, sous la recherche. */}
        {/* Ligne 2 desktop (maquette porteur 2026-08-09) : les repères de
            navigation à gauche, les deux ACTIONS à droite. Elles vivaient
            en ligne 1 ; les remonter ici leur donne le poids de la maquette
            sans les dupliquer — un même libellé à deux endroits finit
            toujours par diverger. */}
        <nav className="mt-2 hidden items-center justify-between gap-7 border-t border-line pt-2 text-sm text-mist md:flex">
          <div className="flex items-center gap-7">
            <CategoryMenu rayons={rayons} labels={menuLabels} />
            <Link href="/catalogue" className="transition hover:text-cloud">
              {t(lang, "nav.catalog")}
            </Link>
            <Link href="/#talents" className="transition hover:text-cloud">
              {t(lang, "nav.talents")}
            </Link>
            <Link href="/#comment" className="transition hover:text-cloud">
              {t(lang, "nav.how")}
            </Link>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {/* Panier — visible dès qu'il contient quelque chose. Un panier
                vide n'a rien à dire ; le montrer quand même ajouterait un
                repère mort au premier écran. */}
            {articlesPanier !== null && articlesPanier > 0 && (
              <Link
                href="/panier"
                aria-label={`${t(lang, "cart.title")} (${articlesPanier})`}
                className="relative rounded-xl border border-line px-3 py-1.5 text-cloud transition hover:border-brand/60"
              >
                <svg
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  className="h-5 w-5 fill-none stroke-current"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M3 4h2l2.4 10.4a2 2 0 002 1.6h7.2a2 2 0 002-1.6L20 7H6" />
                  <circle cx="10" cy="19" r="1.4" />
                  <circle cx="17" cy="19" r="1.4" />
                </svg>
                <span className="numeric absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-brand px-1 text-[11px] font-extrabold text-on-brand">
                  {articlesPanier}
                </span>
              </Link>
            )}
            <Link
              href="/vendre"
              className="rounded-xl border border-accent/60 px-4 py-1.5 text-sm font-semibold text-accent transition hover:bg-accent/10"
            >
              {t(lang, "topbar.sell")}
            </Link>
            {/* Réservé aux CONNECTÉS (revue 2026-08-10, UX-03) : c'est le
                bouton le plus fort de l'écran — plein blanc — et pour un
                anonyme il menait à un mur de connexion. Un primo-visiteur
                n'a pas d'achats à voir ; lui laisser le CTA vendeur seul
                réduit d'un la file d'appels à l'action du premier écran. */}
            {user && (
              <Link
                href="/mes-achats"
                className="rounded-xl bg-cloud px-4 py-1.5 text-sm font-semibold text-ink transition hover:opacity-90"
              >
                {t(lang, "pay.ok.cta")}
              </Link>
            )}
          </div>
        </nav>
      </div>
    </header>
  );
}
