import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminUser, getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getLang } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";
import { AdminMfaForm } from "@/components/admin-mfa-form";
import { LangToggle } from "@/components/lang-toggle";

export const metadata = { robots: { index: false, follow: false } };

export default async function SecuritePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/connexion?next=%2Fsecurite");
  if (user.role !== "admin") redirect("/");
  if (await getAdminUser()) redirect("/admin");
  const lang = await getLang();
  const client = await createClient();
  const result = await client.auth.mfa.listFactors();
  const factors = result.data?.totp ?? [];
  const unavailable = !!result.error || (factors.length === 0 && result.data?.all.some((f) => f.status === "verified"));
  return <main id="main" className="mx-auto min-h-dvh max-w-lg px-5 py-12">
    <div className="mb-10 flex items-center justify-between">
      <Link href="/" className="text-xl font-bold">Zabelie</Link>
      <LangToggle current={lang} />
    </div>
    <h1 className="mb-4 text-3xl font-bold">{t(lang, "mfa.title")}</h1>
    <p className="mb-8 text-mist">{t(lang, "mfa.intro")}</p>
    {unavailable ? <div className="space-y-4">
      <p role="alert">{t(lang, "mfa.unavailable")}</p>
      <p className="text-sm text-mist">{t(lang, "mfa.recovery")}</p>
      <a href="/securite" className="underline">{t(lang, "mfa.retry")}</a>
    </div> : <AdminMfaForm factors={factors.map((factor) => ({ id: factor.id, name: factor.friendly_name || t(lang, "mfa.factor") }))} labels={{
      setup: t(lang, "mfa.setup"), scan: t(lang, "mfa.scan"), secret: t(lang, "mfa.secret"),
      code: t(lang, "mfa.code"), verify: t(lang, "mfa.verify"), busy: t(lang, "mfa.busy"),
      error: t(lang, "mfa.error"), factor: t(lang, "mfa.factor"), recovery: t(lang, "mfa.recovery"),
      back: t(lang, "auth.back.home"),
    }} />}
  </main>;
}
