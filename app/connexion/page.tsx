import { ConnexionForm } from "@/components/connexion-form";
import { LangToggle } from "@/components/lang-toggle";
import { getLang } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";

export default async function ConnexionPage() {
  const lang = await getLang();
  return (
    <>
      {/* BL-130 (FRONT-12a) : page sans SiteNav — le bouton FR/KR restait
          hors d'atteinte, l'utilisateur KR était basculé en français sans
          retour possible au moment du mot de passe. */}
      <div className="fixed right-4 top-4 z-50">
        <LangToggle current={lang} />
      </div>
      <ConnexionForm
        labels={{
          tabSignin: t(lang, "auth.tab.signin"),
          tabSignup: t(lang, "auth.tab.signup"),
          namePh: t(lang, "auth.name.ph"),
          nameRequired: t(lang, "auth.name.required"),
          nameReserved: t(lang, "auth.name.reserved"),
          emailPh: t(lang, "auth.email.ph"),
          passwordPh: t(lang, "auth.password.ph"),
          signinCta: t(lang, "auth.signin.cta"),
          signupCta: t(lang, "auth.signup.cta"),
          signupSuccess: t(lang, "auth.signup.success"),
          demoMode: t(lang, "auth.demo.mode"),
          linkExpired: t(lang, "auth.link.expired"),
          backHome: t(lang, "auth.back.home"),
          errorGeneric: t(lang, "error.generic"),
          forgot: t(lang, "auth.forgot"),
        }}
      />
    </>
  );
}
