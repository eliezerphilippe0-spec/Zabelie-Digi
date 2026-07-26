import { ForgotPasswordForm } from "@/components/forgot-password-form";
import { getLang } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";

export const metadata = { title: "Mot de passe oublié — Zabelie" };

export default async function ForgotPasswordPage() {
  const lang = await getLang();
  return (
    <ForgotPasswordForm
      labels={{
        title: t(lang, "forgot.title"),
        subtitle: t(lang, "forgot.subtitle"),
        emailPh: t(lang, "auth.email.ph"),
        submit: t(lang, "forgot.submit"),
        sending: t(lang, "forgot.sending"),
        success: t(lang, "forgot.success"),
        back: t(lang, "forgot.back"),
        errorGeneric: t(lang, "error.generic"),
        demoMode: t(lang, "auth.demo.mode"),
      }}
    />
  );
}
