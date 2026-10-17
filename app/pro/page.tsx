import Link from "next/link";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/products";
import { getProfessional } from "@/lib/business";
import { ProConsole } from "@/components/business/pro-console";
import { getLang } from "@/lib/i18n-server";
import { facturationCopy } from "@/lib/facturation-copy";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Espace pro — Zabelie",
  description:
    "Espace pro de Zabelie : préparez des factures pour vos clients et envoyez-les par lien. Réservé aux comptes connectés.",
  alternates: { canonical: "/pro" },
};

function Shell({
  children,
  title,
  subtitle,
}: {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="bg-grain min-h-dvh">
      <SiteNav />
      <main id="main" className="mx-auto max-w-3xl px-5 py-16">
        <h1 className="text-3xl font-extrabold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-2 text-sm text-mist">{subtitle}</p>}
        <div className="mt-8">{children}</div>
      </main>
      <SiteFooter />
    </div>
  );
}

export default async function ProPage() {
  const c = facturationCopy(await getLang());
  if (!isSupabaseConfigured()) {
    return (
      <Shell title={c.proTitle} subtitle={c.demo}>
        <div className="glass rounded-2xl p-6 text-sm text-mist">{c.demoBody}</div>
      </Shell>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return (
      <Shell title={c.proTitle} subtitle={c.login}>
        <Link
          href={`/connexion?next=${encodeURIComponent("/pro")}`}
          className="bouton inline-block rounded-xl bg-brand px-6 py-3 text-sm font-semibold text-on-brand"
        >
          {c.loginCta}
        </Link>
      </Shell>
    );
  }

  const admin = createAdminClient();
  const pro = await getProfessional(admin, user.id);

  // Pas encore de profil pro → écran d'ouverture.
  if (!pro) {
    return (
      <Shell title={c.proTitle} subtitle={c.open}>
        <ProConsole professional={null} clients={[]} invoices={[]} labels={c} />
      </Shell>
    );
  }

  const [{ data: clients }, { data: invoices }] = await Promise.all([
    admin
      .from("zabelie_biz_clients")
      .select("id, name, phone, email")
      .eq("professional_id", pro.id)
      .order("created_at", { ascending: false }),
    admin
      .from("zabelie_biz_invoices")
      .select("id, invoice_number, status, total_htg, paid_htg, created_at, client_id")
      .eq("professional_id", pro.id)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  return (
    <Shell title={c.proTitle} subtitle={c.account.replace("{nom}", pro.display_name)}>
      <ProConsole
        professional={{ id: pro.id, displayName: pro.display_name }}
        clients={clients ?? []}
        invoices={invoices ?? []}
        labels={c}
      />
    </Shell>
  );
}
