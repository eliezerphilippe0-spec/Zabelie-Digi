import { NextResponse } from "next/server";
import { erreurTraduite } from "@/lib/api-erreur";
import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingFunction } from "@/lib/pg-errors";
import { KYC_BUCKET } from "@/lib/kyc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Purge des pièces d'identité après décision (docs/35 V-6, `0079`).
 *
 * Une pièce d'identité gardée « au cas où » est une fuite qui attend son
 * incident : la rétention est bornée (config `retention_jours`, défaut 90
 * après la décision) et ce cron l'applique.
 *
 * ORDRE DÉLIBÉRÉ — les objets D'ABORD, les lignes ENSUITE. Si le passage
 * échoue au milieu, le suivant reprend : il reste des lignes qui pointent des
 * objets déjà supprimés, ce qui est réparable. L'ordre inverse laisserait des
 * pièces d'identité au stockage sans plus aucune trace de leur existence —
 * irréparable, et invisible.
 *
 *   - GET  → cron Vercel (Authorization: Bearer $CRON_SECRET)
 *   - POST → appel manuel (Authorization: Bearer $RECONCILE_SECRET)
 */
function authorize(req: Request): boolean {
  const bearer = req.headers.get("authorization")?.replace("Bearer ", "");
  const cron = process.env.CRON_SECRET;
  const manual = process.env.RECONCILE_SECRET;
  if (cron && bearer === cron) return true;
  if (manual && (bearer === manual || req.headers.get("x-reconcile-secret") === manual))
    return true;
  return false;
}

/**
 * Journal émis à CHAQUE passage, y compris à zéro — sans quoi « le cron n'a
 * pas tourné » et « il a tourné, rien à purger » rendent le même silence.
 */
function journal(champs: Record<string, unknown>) {
  console.log("[kyc/purge]", JSON.stringify({ at: new Date().toISOString(), ...champs }));
}

/**
 * Le travail lui-même, extrait pour passer sous bail sans que la cascade de
 * retours anticipés ait à changer. Il rend une réponse HTTP : c'est plus
 * simple que de la reconstruire dehors, et ça garde chaque cas d'échec
 * exactement là où il était.
 */
async function travail(admin: ReturnType<typeof createAdminClient>) {
  const { data: expires, error } = await admin.rpc("zabelie_kyc_docs_expires");
  if (error) {
    // Migration non appliquée : dégradation visible, pas une panne.
    if (isMissingFunction(error)) {
      journal({ statut: "0079_absente", purges: -1 });
      return NextResponse.json({ ok: true, purges: -1 });
    }
    journal({ statut: "erreur_lecture", code: error.code });
    return erreurTraduite("api.read.failed", 500);
  }

  const lignes = (expires ?? []) as { id: string; storage_path: string }[];
  if (lignes.length === 0) {
    journal({ purges: 0 });
    return NextResponse.json({ ok: true, purges: 0 });
  }

  // 1. Les objets.
  const { error: rmErr } = await admin.storage
    .from(KYC_BUCKET)
    .remove(lignes.map((l) => l.storage_path));
  if (rmErr) {
    journal({ statut: "stockage_refuse", candidats: lignes.length });
    return erreurTraduite("api.write.failed", 502);
  }

  // 2. Les lignes — seulement une fois les objets partis.
  const { data: n, error: delErr } = await admin.rpc("zabelie_purge_kyc_documents", {
    p_ids: lignes.map((l) => l.id),
  });
  if (delErr) {
    journal({ statut: "lignes_restantes", objets_supprimes: lignes.length });
    return erreurTraduite("api.write.failed", 500);
  }

  journal({ purges: Number(n ?? 0) });
  return NextResponse.json({ ok: true, purges: Number(n ?? 0) });
}

async function handle(req: Request) {
  if (!authorize(req)) {
    return erreurTraduite("api.access.denied", 401);
  }

  const admin = createAdminClient();

  /* BAIL D'EXÉCUTION (`0060`) — un seul porteur à la fois.
   *
   * ⚠️ Ajouté le 2026-08-20. `lib/cron-lease.ts` a été écrit pour que « le
   * huitième cron en hérite sans y penser » — et il ne servait qu'à UNE route
   * sur huit. Ici l'enjeu est concret : la purge supprime des objets de
   * stockage AVANT les lignes qui les décrivent. Deux passages concurrents
   * pourraient viser les mêmes chemins, et le second verrait un refus de
   * stockage sur des objets déjà partis.
   *
   * Fail-open si `0060` manque : un bail est une garantie ADDITIONNELLE. */
  const { avecBail } = await import("@/lib/cron-lease");
  const { bail, resultat } = await avecBail(
    admin,
    "kyc_purge",
    `kyc-${Date.now()}`,
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
