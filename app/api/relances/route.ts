import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { avecBail } from "@/lib/cron-lease";
import { envoyerRelances } from "@/lib/relances-paiement";
import { isEmailEnabled, sendEmail } from "@/lib/zabelie-email";
import { siteUrl } from "@/lib/site-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Cron des relances de paiement abandonné (0124), une fois par jour.
 *
 * ⚠️ Sans fournisseur d'e-mail, le passage s'arrête AVANT de réserver quoi
 * que ce soit : une relance réservée n'est jamais renvoyée, il ne faut donc
 * pas la consommer tant qu'aucun e-mail ne peut partir. Le journal le dit,
 * pour que « rien envoyé » et « rien à envoyer » ne se confondent pas.
 */
function authorize(req: Request): boolean {
  const bearer = req.headers.get("authorization")?.replace("Bearer ", "");
  const cron = process.env.CRON_SECRET;
  return Boolean(cron && bearer === cron);
}

function journal(champs: Record<string, unknown>) {
  console.log("[relances]", JSON.stringify(champs));
}

async function handle(req: Request) {
  if (!authorize(req)) {
    journal({ issue: "non_autorise", secretConfigure: Boolean(process.env.CRON_SECRET) });
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isEmailEnabled()) {
    journal({ ignore: "email_non_configure" });
    return NextResponse.json({ ignore: "email_non_configure" }, { status: 200 });
  }
  const admin = createAdminClient();
  const { bail, resultat } = await avecBail(admin, "relances_paiement", `relances-${Date.now()}`, () =>
    envoyerRelances(admin, sendEmail, siteUrl()),
  { journal: (champs) => journal({ issue: "bail", ...champs }) });
  if (!bail.autorise || !resultat) {
    journal({ ignore: "bail_tenu" });
    return NextResponse.json({ ignore: "bail_tenu" }, { status: 200 });
  }
  journal({ ...resultat });
  return NextResponse.json({ ok: !resultat.erreurBase, ...resultat }, { status: resultat.erreurBase ? 500 : 200 });
}

export const GET = handle;
export const POST = handle;
