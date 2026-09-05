import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { SignOutButton } from "@/components/sign-out-button";
import { LangToggle } from "@/components/lang-toggle";
import { ThemeToggle } from "@/components/theme-toggle";
import { SearchBox, type SearchSuggestion } from "@/components/search-box";
import { MetricA } from "@/components/metric-a";
import { HeaderShell } from "@/components/header-shell";
import { CategoryChips } from "@/components/category-chips";
import { AccountMenu, MENU_LINK } from "@/components/account-menu";
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

/**
 * EN-TÊTE COMPACT — accueil premium, Phase 2 (brief §4.1, 2026-09-04).
 *
 * Une ligne : logo 32 px · recherche pleine largeur (loupe, plus de bouton
 * texte) · panier · compte. Dessous : les CHIPS des rayons qui ont des
 * produits, défilantes. C'est tout. Mesuré avant : 250 px sur 812 (31 % de
 * l'écran, `docs/home-premium/before/mesures.json`) ; cible A2 : ≤ 100 px.
 *
 * Ce qui a quitté la barre, et où c'est allé :
 *   • topbar (thème, langue, WhatsApp) → menu compte ;
 *   • « Rayons · Catalogue · Talents · Aide » → chips (rayons non vides),
 *     menu compte (Aide, Talents, Comment ça marche), pied de page ;
 *   • « Vendez sur Zabelie », « Voir mes achats », Tableau de bord, Messages,
 *     Facturation, Mes ventes, Admin, Déconnexion → menu compte.
 * Rien n'a disparu du produit ; tout a cessé d'être au-dessus du premier
 * produit.
 *
 * COLLANT PARTOUT, et c'est un retour mesuré sur l'arbitrage du 2026-08-22
 * (collant à partir de la largeur `md` seulement, parce que 250 px collés
 * mangeaient le tiers d'un écran de 740 px). À ~100 px au repos et ~56 px replié (`HeaderShell`), la
 * recherche redevient atteignable en permanence sur mobile — ce que cet
 * arbitrage avait dû sacrifier.
 *
 * Fond : `--brand-gradient` (posé par HeaderShell), texte et icônes
 * `on-chrome`, paires vérifiées par scripts/zabelie-contrast.mjs sur les
 * trois arrêts du dégradé.
 */
export async function SiteNav() {
  const [user, lang] = await Promise.all([getCurrentUser(), getLang()]);
  // Le menu vient de la BASE (`zabelie_categories`), jamais d'une liste écrite
  // en dur : les libellés sont traduits, les rayons vides sont marqués.
  const rayons = await getMenuRayons(lang);
  const wa = whatsappHref(t(lang, "wa.prefill"));

  /* Compteur du panier — lu avec le client de SESSION : la RLS de 0058 ne
   * rend que le panier de l'appelant, donc aucun filtre applicatif à écrire
   * (et aucun à oublier). `head: true` : on veut le nombre, pas les lignes.
   *
   * Erreur ou 0058 non appliquée → `null`, et le badge se masque. Un panier
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
    <HeaderShell className="sticky top-0 z-50 bg-chrome text-on-chrome">
      {/* LIEN D'ÉVITEMENT (audit UX 2026-09-02, #14). Invisible jusqu'au
          premier Tab, puis un vrai bouton en haut à gauche. Cible :
          `<main id="main">`. */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-xl focus:bg-brand focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-on-brand"
      >
        {t(lang, "a11y.skip")}
      </a>

      <div className="mx-auto max-w-6xl px-3">
        {/* LIGNE 1 — logo · recherche · panier · compte */}
        <div className="flex min-h-12 items-center gap-2">
          <BrandLogo nomMasqueSurMobile className="header-fold shrink-0 text-on-chrome" />

          <SearchBox
            compact
            variant="header"
            placeholder={t(lang, "catalog.search.ph")}
            submitLabel={t(lang, "catalog.search.btn")}
            suggestionsLabel={t(lang, "search.sugg")}
            items={suggestionsDepuisRayons(rayons)}
          />

          {/* Panier — l'icône vit pour un compte connecté ; le badge n'apparaît
              qu'avec un contenu (un « 0 » n'informe pas). Client de session,
              jamais service role : le compteur est CELUI de l'appelant. */}
          {articlesPanier !== null && (
            <Link
              href="/panier"
              aria-label={`${t(lang, "cart.title")}${articlesPanier > 0 ? ` (${articlesPanier})` : ""}`}
              className="relative inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl text-on-chrome transition hover:bg-on-chrome/10"
            >
              <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
                className="h-6 w-6 fill-none stroke-current"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 4h2l2.4 10.4a2 2 0 002 1.6h7.2a2 2 0 002-1.6L20 7H6" />
                <circle cx="10" cy="19" r="1.4" />
                <circle cx="17" cy="19" r="1.4" />
              </svg>
              {articlesPanier > 0 && (
                <span className="numeric absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-brand px-1 text-[11px] font-extrabold text-on-brand">
                  {articlesPanier}
                </span>
              )}
            </Link>
          )}

          <AccountMenu label={t(lang, "nav.account")}>
            {user ? (
              <>
                <Link href="/tableau-de-bord" className={MENU_LINK}>
                  {t(lang, "nav.dashboard")}
                </Link>
                <Link href="/mes-achats" className={MENU_LINK}>
                  {t(lang, "pay.ok.cta")}
                </Link>
                <Link href="/mes-ventes" className={MENU_LINK}>
                  {t(lang, "sales.title")}
                </Link>
                {/* La messagerie n'existe que si on peut y arriver (0090). */}
                <Link href="/messages" className={MENU_LINK}>
                  {t(lang, "msg.title")}
                </Link>
                <Link href="/pro" className={MENU_LINK}>
                  {t(lang, "nav.pro")}
                </Link>
                {user.role === "admin" && (
                  <Link href="/admin" className={MENU_LINK}>
                    Admin
                  </Link>
                )}
              </>
            ) : (
              <Link href="/connexion" className={`${MENU_LINK} font-semibold`}>
                {t(lang, "nav.login")}
              </Link>
            )}
            <Link href="/vendre" className={`${MENU_LINK} text-accent`}>
              {t(lang, "topbar.sell")}
            </Link>
            <div className="my-1 border-t border-line" />
            <Link href="/aide" className={MENU_LINK}>
              {t(lang, "nav.help")}
            </Link>
            <Link href="/#talents" className={MENU_LINK}>
              {t(lang, "nav.talents")}
            </Link>
            <Link href="/#comment" className={MENU_LINK}>
              {t(lang, "nav.how")}
            </Link>
            {/* Masqué tant que le porteur n'a pas posé le numéro (env). */}
            {wa && (
              <MetricA event="whatsapp_clicked" href={wa} className={MENU_LINK}>
                {t(lang, "wa.chat")}
              </MetricA>
            )}
            <div className="my-1 border-t border-line" />
            <div className="flex items-center justify-between gap-2 px-1">
              <LangToggle current={lang} />
              <ThemeToggle
                labelToLight={t(lang, "nav.theme.light")}
                labelToDark={t(lang, "nav.theme.dark")}
              />
            </div>
            {/* La déconnexion est dans le MÊME menu à toutes les largeurs :
                Android partagé, cybercafé — c'est exactement là qu'elle compte.
                Un formulaire, donc aucun JS requis. */}
            {user && (
              <SignOutButton
                label={t(lang, "nav.logout")}
                className={`${MENU_LINK} w-full text-left`}
              />
            )}
          </AccountMenu>
        </div>

        {/* LIGNE 2 — chips des rayons NON vides, défilantes ; se plie au
            défilement avec le logo (HeaderShell). */}
        <CategoryChips
          rayons={rayons}
          labels={{
            all: t(lang, "nav.catalog"),
            more: t(lang, "home.chips.more"),
            nav: t(lang, "menu.rayons"),
          }}
        />
      </div>
    </HeaderShell>
  );
}
