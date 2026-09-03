import { ConnexionForm } from "@/components/connexion-form";
import { LangToggle } from "@/components/lang-toggle";
import { getLang } from "@/lib/i18n-server";
import { t, type I18nKey } from "@/lib/i18n";
import { resolveAuthProviders, type AuthProviderId } from "@/lib/auth-providers";

/* V-19 — un libellé par fournisseur, en clé LITTÉRALE : c'est ce que
   `tests/i18n-cles-mortes.test.ts` croise. Une clé construite (`auth.oauth.${id}`)
   compterait par préfixe et cacherait une traduction manquante. */
const LIBELLES: Record<AuthProviderId, I18nKey> = {
  google: "auth.oauth.google",
  microsoft: "auth.oauth.microsoft",
  facebook: "auth.oauth.facebook",
  apple: "auth.oauth.apple",
};

export default async function ConnexionPage() {
  const lang = await getLang();
  /* Lue côté SERVEUR, à la requête. La liste ne contient que ce que le
     porteur a nommé APRÈS l'avoir activé chez Supabase (OPS_TODO) : absente
     ou vide, aucun bouton — c'est l'état de production par défaut. */
  const providers = resolveAuthProviders(process.env.NEXT_PUBLIC_AUTH_PROVIDERS).map(
    (p) => ({ ...p, label: t(lang, LIBELLES[p.id]) })
  );
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
          errConfig: t(lang, "auth.err.config"),
          linkExpired: t(lang, "auth.link.expired"),
          backHome: t(lang, "auth.back.home"),
          errorGeneric: t(lang, "error.generic"),
          forgot: t(lang, "auth.forgot"),
          errExists: t(lang, "auth.err.exists"),
          errCredentials: t(lang, "auth.err.credentials"),
          errPassword: t(lang, "auth.err.password"),
          errNotConfirmed: t(lang, "auth.err.notconfirmed"),
          errRate: t(lang, "auth.err.rate"),
          errDisabled: t(lang, "auth.err.disabled"),
          errEmail: t(lang, "auth.err.email"),
          errNetwork: t(lang, "auth.err.network"),
          oauthOr: t(lang, "auth.oauth.or"),
          errProvider: t(lang, "auth.err.provider"),
        }}
        providers={providers}
      />
    </>
  );
}
