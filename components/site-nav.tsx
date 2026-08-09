import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { SignOutButton } from "@/components/sign-out-button";
import { LangToggle } from "@/components/lang-toggle";
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

  return (
    <header className="sticky top-0 z-50">
      {/* TOPBAR — une ligne : l'entrée vendeur, le contact humain, la langue.
          Le CTA vendeur vit ICI désormais : toujours présent, jamais dominant
          — le hero appartient à l'acheteur. */}
      <div className="border-b border-line bg-ink/95 backdrop-blur">
        <div className="mx-auto flex h-9 max-w-6xl items-center justify-between gap-4 px-5 text-xs">
          <Link href="/vendre" className="font-semibold text-accent transition hover:text-accent-strong">
            {t(lang, "topbar.sell")}
          </Link>
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
          <nav className="flex items-center gap-5 text-sm text-mist">
            <Link href="/catalogue" className="py-1 transition hover:text-cloud">
              {t(lang, "nav.catalog")}
            </Link>
            <Link href="/#talents" className="py-1 transition hover:text-cloud">
              {t(lang, "nav.talents")}
            </Link>
            <Link href="/aide" className="py-1 transition hover:text-cloud">
              {t(lang, "nav.help")}
            </Link>
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
            <Link
              href="/vendre"
              className="rounded-xl border border-accent/60 px-4 py-1.5 text-sm font-semibold text-accent transition hover:bg-accent/10"
            >
              {t(lang, "topbar.sell")}
            </Link>
            <Link
              href="/mes-achats"
              className="rounded-xl bg-cloud px-4 py-1.5 text-sm font-semibold text-ink transition hover:opacity-90"
            >
              {t(lang, "pay.ok.cta")}
            </Link>
          </div>
        </nav>
      </div>
    </header>
  );
}
