import { NextResponse } from "next/server";
import { erreurTraduite } from "@/lib/api-erreur";
import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingFunction } from "@/lib/pg-errors";
import { AUTHORING_BUCKET } from "@/lib/storage-buckets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Projets traités par passage, et chemins retirés par appel au stockage. */
const PROJETS_PAR_PASSAGE = 200;
const CHEMINS_PAR_APPEL = 500;

/**
 * Purge des projets du Studio de création après fermeture du compte (0149 ;
 * tâche 5.3, docs/70 §7.6).
 *
 * Un compte fermé (`account_closed`, posé par `app/api/account`) ne garde ni
 * ses guides, ni leurs révisions, ni les PDF du bucket privé. Ses fiches
 * produit et les fichiers vendus restent : ce sont des copies (5.2), et les
 * droits des acheteurs n'en dépendent pas. Un projet qui a servi le jour même
 * attend le passage suivant (règle des quotas, 0149).
 *
 * Indépendante du drapeau du Studio : un compte fermé pendant que le Studio
 * est éteint doit être purgé quand même.
 *
 * ORDRE DÉLIBÉRÉ, comme la purge KYC : les objets D'ABORD, les lignes
 * ENSUITE. Une panne au milieu laisse des lignes que le passage suivant
 * reprend ; l'ordre inverse laisserait des guides au stockage sans trace.
 *
 *   - GET  → cron Vercel (Authorization: Bearer $CRON_SECRET)
 *   - POST → appel manuel (Authorization: Bearer $RECONCILE_SECRET)
 */
function authorize(req: Request): boolean {
  const bearer = req.headers.get("authorization")?.replace("Bearer ", "");
  const cron = process.env.CRON_SECRET;
  const manual = process.env.RECONCILE_SECRET;
  if (cron && bearer === cron) return true;
  if (manual && (bearer === manual || req.headers.get("x-reconcile-secret") === manual)) return true;
  return false;
}

/** Journal émis à CHAQUE passage, y compris à zéro : « pas tourné » et « rien à purger » ne se confondent pas. */
function journal(champs: Record<string, unknown>) {
  console.log("[authoring/purge]", JSON.stringify({ at: new Date().toISOString(), ...champs }));
}

async function travail(admin: ReturnType<typeof createAdminClient>) {
  const { data, error } = await admin.rpc("zabelie_authoring_purge_candidats", { p_limite: PROJETS_PAR_PASSAGE });
  if (error) {
    // Migration non appliquée : dégradation visible, pas une panne.
    if (isMissingFunction(error)) {
      journal({ statut: "0149_absente", purges: -1 });
      return NextResponse.json({ ok: true, purges: -1 });
    }
    journal({ statut: "erreur_lecture", code: error.code });
    return erreurTraduite("api.read.failed", 500);
  }

  const lignes = ((data ?? []) as { project_id: string; chemins: string[] | null }[]).filter((l) => typeof l.project_id === "string");
  if (lignes.length === 0) {
    journal({ purges: 0 });
    return NextResponse.json({ ok: true, purges: 0 });
  }

  // 1. Les objets.
  const chemins = [...new Set(lignes.flatMap((l) => l.chemins ?? []))];
  for (let i = 0; i < chemins.length; i += CHEMINS_PAR_APPEL) {
    const { error: rmErr } = await admin.storage.from(AUTHORING_BUCKET).remove(chemins.slice(i, i + CHEMINS_PAR_APPEL));
    if (rmErr) {
      journal({ statut: "stockage_refuse", candidats: lignes.length });
      return erreurTraduite("api.write.failed", 502);
    }
  }

  // 2. Les lignes, seulement une fois les objets partis. La base revérifie tout.
  const { data: n, error: delErr } = await admin.rpc("zabelie_authoring_purge_comptes_fermes", {
    p_projets: lignes.map((l) => l.project_id),
  });
  if (delErr) {
    journal({ statut: "lignes_restantes", objets_supprimes: chemins.length });
    return erreurTraduite("api.write.failed", 500);
  }

  journal({ purges: Number(n ?? 0), objets_supprimes: chemins.length });
  return NextResponse.json({ ok: true, purges: Number(n ?? 0) });
}

async function handle(req: Request) {
  if (!authorize(req)) return erreurTraduite("api.access.denied", 401);
  const admin = createAdminClient();
  // Un seul porteur à la fois (0060) : deux passages viseraient les mêmes chemins.
  const { avecBail } = await import("@/lib/cron-lease");
  const { bail, resultat } = await avecBail(
    admin,
    "authoring_purge",
    `authoring-${Date.now()}`,
    async () => travail(admin),
    { journal: (champs) => journal({ statut: "bail", ...champs }) }
  );
  if (!bail.autorise) {
    journal({ statut: "ignore_bail_tenu" });
    return NextResponse.json({ ignore: "bail_tenu" }, { status: 200 });
  }
  return resultat!;
}

export const GET = handle;
export const POST = handle;
