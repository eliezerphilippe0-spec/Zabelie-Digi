import { getLang } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";
import { exportCollections } from "@/lib/collection-export";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/account/export
 * Portabilité (RGPD Art. 15/20) : renvoie l'ensemble des données de l'utilisateur
 * connecté au format JSON téléchargeable. Lecture via service role, strictement
 * bornée à ses propres données (buyer_id / seller_id / owner_id = user.id).
 */
export async function GET() {
  const lang = await getLang();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  }

  const admin = createAdminClient();
  const [profile, products, orders, wallet, acceptances] = await Promise.all([
    admin.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    admin.from("products").select("*").eq("seller_id", user.id),
    admin.from("orders").select("*").eq("buyer_id", user.id),
    admin.from("wallets").select("*").eq("owner_id", user.id).maybeSingle(),
    admin.from("zabelie_policy_acceptances").select("policy_version,accepted_at").eq("user_id", user.id).order("accepted_at"),
  ]);
  if (acceptances.error || !acceptances.data) return NextResponse.json({ error: t(lang, "api.unavailable") }, { status: 503 });

  /* STUDIO DE CRÉATION (tâche 5.3) : les guides du vendeur, leurs versions,
   * leurs PDF et les suggestions reçues. Bornés à SES lignes (`seller_id`).
   * Ni chemin de stockage ni jeton de bail : ce sont des détails internes, pas
   * ses données. Une lecture ratée rend 503 plutôt qu'un export qui se tairait
   * sur ses guides ; des tables absentes (Studio jamais installé) rendent vide. */
  const studio = await Promise.all([
    admin.from("zabelie_authoring_projects")
      .select("id, titre, langue, public_vise, marche_diaspora, brief, contenu, revision, plan_approuve_revision, revision_approuvee, revision_approuvee_le, created_at, updated_at, archived_at")
      .eq("seller_id", user.id),
    admin.from("zabelie_authoring_revisions")
      .select("id, project_id, numero, titre, langue, public_vise, marche_diaspora, brief, contenu, created_at")
      .eq("seller_id", user.id),
    admin.from("zabelie_authoring_exports")
      .select("id, project_id, revision, empreinte, taille, pages, extrait_empreinte, extrait_taille, extrait_pages, created_at, approuve_le")
      .eq("seller_id", user.id),
    admin.from("zabelie_authoring_operations")
      .select("id, project_id, type, section_id, etat, fournisseur, resultat, code_erreur, created_at, termine_le")
      .eq("seller_id", user.id),
  ]);
  const absente = (e: { code?: string } | null) => e?.code === "42P01" || e?.code === "PGRST205";
  if (studio.some((r) => r.error && !absente(r.error))) return NextResponse.json({ error: t(lang, "api.unavailable") }, { status: 503 });
  const [projetsStudio, revisionsStudio, exportsStudio, operationsStudio] = studio.map((r) => (r.error ? [] : r.data ?? []));

  let collections;
  try { collections = await exportCollections(supabase, user.id); }
  catch { return NextResponse.json({ error: t(lang, "collections.error") }, { status: 503 }); }
  const payload = {
    ...collections,
    exported_at: new Date().toISOString(),
    account: { id: user.id, email: user.email },
    profile: profile.data ?? null,
    products_as_seller: products.data ?? [],
    orders_as_buyer: orders.data ?? [],
    wallet: wallet.data ?? null,
    legal_acknowledgements: acceptances.data,
    studio_creation: {
      projets: projetsStudio,
      revisions: revisionsStudio,
      exports_pdf: exportsStudio,
      suggestions: operationsStudio,
    },
  };

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": 'attachment; filename="mes-donnees-zabelie.json"',
      "Cache-Control": "no-store",
    },
  });
}
