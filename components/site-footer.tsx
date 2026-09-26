import { guideHref } from "@/lib/buying-guides";
import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { FooterSection } from "@/components/footer-section";
import { getLang } from "@/lib/i18n-server";
import { t, type I18nKey } from "@/lib/i18n";
import { POLICY_PATH } from "@/lib/policy";
import { etatDisponibilite, getKobaraAvailability, getMonCashAvailability, type EtatPaiement } from "@/lib/payment-availability";
import { isZelleEnabled } from "@/lib/zelle";
import { isStripeEnabled } from "@/lib/stripe-config";
import { whatsappHref } from "@/lib/whatsapp";

/*
 * PIED DE PAGE — refonte du 2026-09-26 (demande porteur : compact, six
 * rubriques sur UNE rangée dès 1 200 px, aucun doublon).
 *
 * ⚠️ LA COLONNE DES RAYONS reste retirée (demande du 2026-08-22) : l'en-tête,
 * l'accueil et `/categories` la portent déjà.
 *
 * Chaque lien n'apparaît qu'UNE fois (`tests/pied-de-page.test.ts`). Écartés
 * pour cette raison, alors qu'ils étaient demandés :
 *   • « Nouveautés » — `/catalogue` est déjà trié du plus récent ;
 *   • « Suivre mes commandes » — même page que « Voir mes achats » ;
 *   • les liens légaux dans la barre du bas — ils sont dans « Légal ».
 * Écartés faute de page : « Tarifs et commissions », « Guide du vendeur ».
 *
 * Fond `chrome` : le token que le thème réserve à l'en-tête et au pied,
 * sombre dans les deux thèmes. Texte secondaire `on-chrome/80` (≥ 11:1),
 * survol `brand` (4,71:1 en clair, 6,36:1 en sombre, mesuré).
 */

const LIEN =
  "inline-flex min-h-11 items-center text-sm text-on-chrome/80 transition-colors hover:text-brand md:min-h-7";

type Etat = EtatPaiement | "manual";
const ETAT_CLE: Record<Etat, I18nKey> = {
  active: "footer.pay.active",
  test: "footer.pay.test",
  soon: "footer.pay.soon",
  off: "footer.pay.off",
  manual: "footer.pay.manual",
};

export async function SiteFooter() {
  const lang = await getLang();
  const contact = Boolean(whatsappHref() || process.env.NEXT_PUBLIC_CONTACT_EMAIL);

  const paiements: { nom: string; etat: Etat }[] = [
    { nom: "MonCash", etat: etatDisponibilite(getMonCashAvailability(), "off") },
    { nom: "NatCash", etat: etatDisponibilite(getKobaraAvailability(), "soon") },
    { nom: t(lang, "footer.pay.card"), etat: isStripeEnabled() ? "active" : "soon" },
    ...(isZelleEnabled() ? [{ nom: "Zelle (USD)", etat: "manual" as Etat }] : []),
  ];

  return (
    <footer className="mt-24 bg-chrome text-on-chrome">
      <div className="mx-auto max-w-6xl px-5 py-8 md:py-12">
        {/* ⚠️ La règle 3 colonnes est BORNÉE (`max-[1199px]`) : Tailwind émet
            `md:` APRÈS `min-[1200px]:` dans la feuille, donc sans borne elle
            gagnait partout — mesuré : deux rangées à 1 920 px. */}
        <div className="grid gap-x-8 md:max-[1199px]:grid-cols-3 md:gap-y-10 min-[1200px]:gap-x-6 min-[1200px]:grid-cols-[1.25fr_1fr_1fr_1fr_1fr_1.2fr]">
          <div className="pb-6 md:pb-0">
            <BrandLogo />
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-on-chrome/80">{t(lang, "footer.tagline")}</p>
            <Link href="/a-propos" className={`${LIEN} mt-1 underline underline-offset-4`}>
              {t(lang, "about.title")}
            </Link>
          </div>

          <FooterSection titre={t(lang, "footer.explore")}>
            <ul className="flex flex-col md:gap-1">
              <li><Link href="/catalogue" className={LIEN}>{t(lang, "nav.catalog")}</Link></li>
              <li><Link href="/categories" className={LIEN}>{t(lang, "directory.title")}</Link></li>
              <li><Link href="/catalogue?univers=objets" className={LIEN}>{t(lang, "universe.physical")}</Link></li>
              <li><Link href="/catalogue?univers=numerique" className={LIEN}>{t(lang, "universe.digital")}</Link></li>
              <li><Link href="/catalogue?univers=services" className={LIEN}>{t(lang, "universe.services")}</Link></li>
              <li><Link href="/recharges" className={LIEN}>{t(lang, "recharges.title")}</Link></li>
            </ul>
          </FooterSection>

          <FooterSection titre={t(lang, "footer.sell")}>
            <ul className="flex flex-col md:gap-1">
              <li><Link href="/vendre" className={LIEN}>{t(lang, "footer.become")}</Link></li>
              <li><Link href="/#comment" className={LIEN}>{t(lang, "nav.how")}</Link></li>
              <li><Link href="/tableau-de-bord" className={LIEN}>{t(lang, "footer.sellerCenter")}</Link></li>
            </ul>
          </FooterSection>

          <FooterSection titre={t(lang, "footer.help")}>
            <ul className="flex flex-col md:gap-1">
              <li><Link href="/aide" className={LIEN}>{t(lang, "footer.helpCenter")}</Link></li>
              <li><Link href="/aide#faq" className={LIEN}>{t(lang, "sec.faq")}</Link></li>
              <li><Link href="/mes-achats" className={LIEN}>{t(lang, "pay.ok.cta")}</Link></li>
              <li><Link href={guideHref(lang)} className={LIEN}>{t(lang, "guides.title")}</Link></li>
              {contact && <li><Link href="/aide#probleme" className={LIEN}>{t(lang, "footer.contact")}</Link></li>}
            </ul>
          </FooterSection>

          <FooterSection titre={t(lang, "footer.legal")}>
            <ul className="flex flex-col md:gap-1">
              <li><Link href="/confidentialite" className={LIEN}>{t(lang, "footer.privacy")}</Link></li>
              <li><Link href="/conditions" className={LIEN}>{t(lang, "footer.terms")}</Link></li>
              <li><Link href={POLICY_PATH} className={LIEN}>{t(lang, "policy.link")}</Link></li>
            </ul>
          </FooterSection>

          <FooterSection titre={t(lang, "footer.payment")}>
            <ul className="flex flex-col gap-2 py-1 md:py-0">
              {paiements.map((p) => (
                <li key={p.nom} className="flex items-center justify-between gap-3 text-sm text-on-chrome/80">
                  <span>{p.nom}</span>
                  <span
                    className={
                      p.etat === "active"
                        ? "rounded-full bg-brand px-2 py-0.5 text-xs font-semibold text-on-brand"
                        : "rounded-full border border-on-chrome/25 px-2 py-0.5 text-xs text-on-chrome/80"
                    }
                  >
                    {t(lang, ETAT_CLE[p.etat])}
                  </span>
                </li>
              ))}
            </ul>
          </FooterSection>
        </div>
      </div>
      <div className="border-t border-on-chrome/15">
        <div className="mx-auto flex max-w-6xl flex-col gap-1 px-5 py-4 text-xs text-on-chrome/80 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Zabelie. {t(lang, "footer.rights")}</p>
          <p>{t(lang, "footer.madeFor")}</p>
        </div>
      </div>
    </footer>
  );
}
