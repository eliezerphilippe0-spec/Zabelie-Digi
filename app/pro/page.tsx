import Link from "next/link";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/products";
import { getProfessional } from "@/lib/business";
import { ProConsole } from "@/components/business/pro-console";

export const dynamic = "force-dynamic";
export const metadata = { title: "Espace pro — Zabelie" };

function Shell({
  children,
  subtitle,
}: {
  children: React.ReactNode;
  subtitle?: string;
}) {
  return (
    <div className="bg-grain min-h-screen">
      <SiteNav />
      <main className="mx-auto max-w-3xl px-5 py-16">
        <h1 className="text-3xl font-extrabold tracking-tight">
          Espace pro — Fè m peye
        </h1>
        {subtitle && <p className="mt-2 text-sm text-mist">{subtitle}</p>}
        <div className="mt-8">{children}</div>
      </main>
      <SiteFooter />
    </div>
  );
}

export default async function ProPage() {
  if (!isSupabaseConfigured()) {
    return (
      <Shell subtitle="Mode démo — connecte Supabase pour créer de vraies factures.">
        <div className="glass rounded-2xl p-6 text-sm text-mist">
          L&apos;espace pro nécessite une base Supabase configurée.
        </div>
      </Shell>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return (
      <Shell subtitle="Connecte-toi pour facturer tes clients.">
        <Link
          href="/connexion"
          className="inline-block rounded-xl bg-brand px-6 py-3 text-sm font-semibold text-ink"
        >
          Se connecter
        </Link>
      </Shell>
    );
  }

  const admin = createAdminClient();
  const pro = await getProfessional(admin, user.id);

  // Pas encore de profil pro → écran d'ouverture.
  if (!pro) {
    return (
      <Shell subtitle="Crée et envoie des factures à tes clients, encaisse en MonCash.">
        <ProConsole professional={null} clients={[]} invoices={[]} />
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
    <Shell subtitle={`Connecté comme ${pro.display_name}.`}>
      <ProConsole
        professional={{ id: pro.id, displayName: pro.display_name }}
        clients={clients ?? []}
        invoices={invoices ?? []}
      />
    </Shell>
  );
}
