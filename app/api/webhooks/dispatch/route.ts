import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { repartir } from "@/lib/webhooks";
import { avecBail } from "@/lib/cron-lease";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Cron des webhooks sortants (0122) : relances dues + purge des envois clos
 * de plus de 30 jours. L'envoi IMMÉDIAT part après chaque confirmation de
 * paiement ; ce passage rattrape les relances et les envois manqués.
 */
function authorize(req: Request): boolean {
  const bearer = req.headers.get("authorization")?.replace("Bearer ", "");
  const cron = process.env.CRON_SECRET;
  return Boolean(cron && bearer === cron);
}

async function handle(req: Request) {
  if (!authorize(req)) {
    console.log("[webhooks/dispatch]", JSON.stringify({ issue: "non_autorise", secretConfigure: Boolean(process.env.CRON_SECRET) }));
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const admin = createAdminClient();
  // Bail d'exécution (0060) : deux passages qui se chevauchent n'envoient pas
  // deux fois — le bail en base des envois le garantit déjà ligne à ligne,
  // celui-ci évite deux répartiteurs concurrents sur le même lot.
  const { bail, resultat } = await avecBail(admin, "webhooks_dispatch", `webhooks-${Date.now()}`, async () => {
    const { data: purges, error } = await admin.rpc("zabelie_webhook_purge");
    if (error) console.error("[webhooks/dispatch] purge impossible", error.message);
    const bilan = await repartir(admin, { lots: 5 });
    return { purges: purges ?? null, purgeEnErreur: Boolean(error), ...bilan };
  }, { journal: (champs) => console.log("[webhooks/dispatch]", JSON.stringify({ issue: "bail", ...champs })) });
  if (!bail.autorise || !resultat) {
    console.log("[webhooks/dispatch]", JSON.stringify({ ignore: "bail_tenu" }));
    return NextResponse.json({ ignore: "bail_tenu" }, { status: 200 });
  }
  console.log("[webhooks/dispatch]", JSON.stringify(resultat));
  const enErreur = resultat.erreurBase || resultat.purgeEnErreur;
  return NextResponse.json({ ok: !enErreur, ...resultat }, { status: enErreur ? 500 : 200 });
}

export const GET = handle;
export const POST = handle;
