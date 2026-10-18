import Link from "next/link";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { VendeurShell } from "@/components/vendeur-shell";
import { DeliveryInfoForm } from "@/components/delivery-info-form";
import { KycForm } from "@/components/kyc-form";
import { AccountActions } from "@/components/account-actions";
import { createAdminClient } from "@/lib/supabase/admin";
import { vendeurOuRedirection } from "@/lib/vendeur-acces";
import { lireDossierKyc } from "@/lib/kyc";
import { isMissingTable } from "@/lib/product-media";
import { getLang } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";

export const dynamic = "force-dynamic";
export const metadata = { title: "Compte — Zabelie", robots: { index: false, follow: false } };

/**
 * /tableau-de-bord/compte — ce qui reste privé (docs/73) : la vérification
 * d'identité, les coordonnées de livraison, mes données et la suppression du
 * compte. Ces trois blocs fermaient un tableau de quinze écrans, sous le
 * profil PUBLIC, ce qui mélangeait ce que voient les clients et ce que
 * personne d'autre ne voit.
 */
export default async function ComptePage() {
  const user = await vendeurOuRedirection("/tableau-de-bord/compte");
  const lang = await getLang();
  const admin = createAdminClient();

  // V-5 : coordonnées de livraison — `undefined` = 0076 non appliquée (le
  // bloc ne se rend pas), sinon les valeurs (vides si jamais renseignées).
  let livInfo:
    | { full_name: string; phone: string; adres_liv: string }
    | undefined;
  const { data: liv, error: livErr } = await admin
    .from("zabelie_delivery_info")
    .select("full_name, phone, adres_liv")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!livErr) {
    livInfo = {
      full_name: liv?.full_name ?? "",
      phone: liv?.phone ?? "",
      adres_liv: liv?.adres_liv ?? "",
    };
  } else if (!isMissingTable(livErr)) {
    console.error("[delivery-info] lecture échouée", livErr.code);
  }

  // V-6 : dossier KYC — `null` = 0079 non appliquée, la section se tait.
  const dossierKyc = await lireDossierKyc(admin, user.id);

  const [avantLien, apresLien] = t(lang, "vendeur.donnees.texte").split("{lien}");

  return (
    <div className="bg-grain min-h-dvh">
      <SiteNav />
      <main id="main">
        <VendeurShell lang={lang} actif="compte">
          <h1 className="text-2xl font-semibold sm:text-3xl">{t(lang, "vendeur.nav.compte")}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-mist">{t(lang, "vendeur.compte.intro")}</p>

          {dossierKyc && (
            <section id="verification" className="max-w-lg scroll-mt-28">
              <KycForm
                statut={dossierKyc.statut}
                deposes={dossierKyc.documents}
                noteAdmin={dossierKyc.noteAdmin}
                labels={{
                  title: t(lang, "kyc.title"),
                  why: t(lang, "kyc.why"),
                  pending: t(lang, "kyc.pending"),
                  approved: t(lang, "kyc.approved"),
                  rejected: t(lang, "kyc.rejected"),
                  cin: t(lang, "kyc.cin"),
                  paspo: t(lang, "kyc.paspo"),
                  selfie: t(lang, "kyc.selfie"),
                  add: t(lang, "kyc.add"),
                  sending: t(lang, "kyc.sending"),
                  error: t(lang, "sell.galerie.error"),
                  deposited: t(lang, "kyc.deposited"),
                }}
              />
            </section>
          )}
          {/* V-5 (docs/35) : coordonnées de livraison — table SÉPARÉE du profil
              public, masquée tant que 0076 n'est pas appliquée. */}
          {livInfo !== undefined && (
            <section id="livraison" className="max-w-lg scroll-mt-28">
              <DeliveryInfoForm
                initial={livInfo}
                labels={{
                  title: t(lang, "profile.liv.title"),
                  fullName: t(lang, "profile.liv.fullname"),
                  phone: t(lang, "profile.liv.phone"),
                  adres: t(lang, "profile.liv.adres"),
                  hint: t(lang, "profile.liv.hint"),
                  save: t(lang, "profile.liv.save"),
                  saving: t(lang, "profile.liv.saving"),
                  saved: t(lang, "profile.liv.saved"),
                  error: t(lang, "sell.galerie.error"),
                }}
              />
            </section>
          )}

          {/* Données & compte (RGPD) */}
          <section id="donnees" className="mt-10 scroll-mt-28">
            <h2 className="titre-section">{t(lang, "vendeur.donnees.titre")}</h2>
            <p className="mt-1 text-sm text-mist">
              {avantLien}
              <Link href="/confidentialite" className="text-cloud underline">
                {t(lang, "vendeur.donnees.lien")}
              </Link>
              {apresLien}
            </p>
            <div className="mt-4 max-w-lg rounded-2xl border border-line bg-surface/60 p-5">
              <AccountActions />
            </div>
          </section>
        </VendeurShell>
      </main>
      <SiteFooter />
    </div>
  );
}
