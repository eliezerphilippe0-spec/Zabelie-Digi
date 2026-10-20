import { getLang } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";
import { exportCollections, readExportRows } from "@/lib/collection-export";
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
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
      return NextResponse.json({ error: t(lang, "api.auth.required") }, { status: 401, headers: { "Cache-Control": "no-store" } });
    }

    const admin = createAdminClient();
    const [profile, wallet, products, orders, acceptances, studio, collections] = await Promise.all([
      admin.from("profiles").select("*").eq("id", user.id).maybeSingle(),
      admin.from("wallets").select("*").eq("owner_id", user.id).maybeSingle(),
      readExportRows(admin, user.id, { table: "products", select: "*", owner: "seller_id", sort: "id" }),
      readExportRows(admin, user.id, { table: "orders", select: "*", owner: "buyer_id", sort: "id" }),
      readExportRows(admin, user.id, { table: "zabelie_policy_acceptances", select: "policy_version,accepted_at", owner: "user_id", sort: ["accepted_at", "policy_version"] }),
      /* Les tables Studio restent facultatives si jamais installées. Chaque page
       * est bornée au vendeur ; aucun chemin de stockage ni jeton de bail. */
      Promise.all([
        readExportRows(admin, user.id, {
          table: "zabelie_authoring_projects", owner: "seller_id", sort: "id", optional: true,
          select: "id, titre, langue, public_vise, marche_diaspora, brief, contenu, revision, plan_approuve_revision, revision_approuvee, revision_approuvee_le, created_at, updated_at, archived_at",
        }),
        readExportRows(admin, user.id, {
          table: "zabelie_authoring_revisions", owner: "seller_id", sort: "id", optional: true,
          select: "id, project_id, numero, titre, langue, public_vise, marche_diaspora, brief, contenu, created_at",
        }),
        readExportRows(admin, user.id, {
          table: "zabelie_authoring_exports", owner: "seller_id", sort: "id", optional: true,
          select: "id, project_id, revision, empreinte, taille, pages, extrait_empreinte, extrait_taille, extrait_pages, created_at, approuve_le",
        }),
        readExportRows(admin, user.id, {
          table: "zabelie_authoring_operations", owner: "seller_id", sort: "id", optional: true,
          select: "id, project_id, type, section_id, etat, fournisseur, resultat, code_erreur, created_at, termine_le",
        }),
      ]),
      exportCollections(supabase, user.id),
    ]);
    if ([profile, wallet].some((result) => !result || result.error || result.data === undefined ||
      (result.data !== null && (typeof result.data !== "object" || Array.isArray(result.data))))) {
      throw new Error("account_export_unavailable");
    }
    const [projetsStudio, revisionsStudio, exportsStudio, operationsStudio] = studio;
    const payload = {
      ...collections,
      exported_at: new Date().toISOString(),
      account: { id: user.id, email: user.email },
      profile: profile.data,
      products_as_seller: products,
      orders_as_buyer: orders,
      wallet: wallet.data,
      legal_acknowledgements: acceptances,
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
  } catch {
    return NextResponse.json({ error: t(lang, "api.unavailable") }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
