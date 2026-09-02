import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/products";
import { getProfessional } from "@/lib/business";
import { siteUrl } from "@/lib/site-url";
import { InvoiceEditor } from "@/components/business/invoice-editor";

export const dynamic = "force-dynamic";
export const metadata = { title: "Facture — Espace pro" };

export default async function InvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!isSupabaseConfigured()) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");

  const admin = createAdminClient();
  const pro = await getProfessional(admin, user.id);
  if (!pro) redirect("/pro");

  const { data: invoice } = await admin
    .from("zabelie_biz_invoices")
    .select(
      "id, invoice_number, status, subtotal_htg, total_htg, paid_htg, public_token, due_date, client_id"
    )
    .eq("id", id)
    .eq("professional_id", pro.id)
    .maybeSingle();
  if (!invoice) notFound();

  const [{ data: items }, { data: client }] = await Promise.all([
    admin
      .from("zabelie_biz_invoice_items")
      .select("id, label, qty, unit_price_htg, line_total_htg, sort_order")
      .eq("invoice_id", id)
      .order("sort_order", { ascending: true }),
    admin
      .from("zabelie_biz_clients")
      .select("name")
      .eq("id", invoice.client_id)
      .maybeSingle(),
  ]);

  /* Même défaut que `lib/zabelie-notify.ts` : le repli `""` fabriquait un
   * lien de partage RELATIF (`/facture/<token>`), c'est-à-dire inutilisable
   * dès qu'on le colle ailleurs — or partager ce lien est toute la raison
   * d'être de cet écran. */
  const origin = siteUrl();
  const shareUrl = `${origin}/facture/${invoice.public_token}`;

  return (
    <div className="bg-grain min-h-dvh">
      <SiteNav />
      <main id="main" className="mx-auto max-w-2xl px-5 py-16">
        <Link href="/pro" className="text-sm text-mist hover:underline">
          ← Espace pro
        </Link>
        <InvoiceEditor
          invoice={invoice}
          items={items ?? []}
          clientName={client?.name ?? "Client"}
          shareUrl={shareUrl}
        />
      </main>
      <SiteFooter />
    </div>
  );
}
