import { ResetPasswordForm } from "@/components/reset-password-form";
import { getLang } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";

export const metadata = { title: "Nouveau mot de passe — Zabelie" };

export default async function ResetPasswordPage() {
  const lang = await getLang();
  return (
    <ResetPasswordForm
      labels={{
        title: t(lang, "reset.title"),
        subtitle: t(lang, "reset.subtitle"),
        passwordPh: t(lang, "auth.password.ph"),
        confirmPh: t(lang, "reset.confirm.ph"),
        mismatch: t(lang, "reset.mismatch"),
        submit: t(lang, "reset.submit"),
        submitting: t(lang, "reset.submitting"),
        success: t(lang, "reset.success"),
        invalid: t(lang, "reset.invalid"),
        signinCta: t(lang, "auth.signin.cta"),
        errorGeneric: t(lang, "error.generic"),
      }}
    />
  );
}
