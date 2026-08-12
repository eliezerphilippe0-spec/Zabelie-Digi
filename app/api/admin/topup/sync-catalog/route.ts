import { NextResponse } from "next/server";
import {
  isTopupFirstPartyEnabled,
  TOPUP_CLOSED_BODY,
  TOPUP_CLOSED_STATUS,
} from "@/lib/topup-flag";
import { getCurrentUser } from "@/lib/auth";
import { journaliserActeAdmin } from "@/lib/admin-audit";
import { createAdminClient } from "@/lib/supabase/admin";
import { reloadlyProvider, isReloadlyEnabled } from "@/lib/zabelie-topup/reloadly";
import type { TopupOperator, TopupProduct } from "@/lib/zabelie-topup/provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/topup/sync-catalog
 * Remplit `zabelie_topup_products` à partir du vrai catalogue Reloadly
 * (operatorId, dénominations, coûtant) — évite toute saisie SQL manuelle.
 * Réservé au rôle admin. N'exécute AUCUN mouvement d'argent : lecture Reloadly
 * + upsert du catalogue uniquement. Ne désactive jamais une ligne existante
 * (une réponse sandbox partielle ne doit pas vider le catalogue).
 */

const OPERATORS: TopupOperator[] = ["digicel", "natcom"];
const MARGIN = 1.05; // ~5 % (validé porteur, cf. seed 0010)

// Marge ~5 %, jamais nulle/négative → respecte le CHECK price_htg >= cost_htg.
function priceFrom(costHtg: number): number {
  return Math.max(costHtg + 1, Math.round(costHtg * MARGIN));
}

export async function POST() {
  // Synchronise le CATALOGUE de vente : sans vente, sans objet. Fermee avec
  // elle. Les routes de confirmation Zelle et de remboursement restent
  // OUVERTES — elles servent des commandes deja passees.
  if (!isTopupFirstPartyEnabled()) {
    return NextResponse.json(TOPUP_CLOSED_BODY, { status: TOPUP_CLOSED_STATUS });
  }

  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }
  if (!isReloadlyEnabled()) {
    return NextResponse.json(
      { error: "Clés Reloadly absentes (RELOADLY_CLIENT_ID / RELOADLY_CLIENT_SECRET)." },
      { status: 503 }
    );
  }

  // Catalogue fournisseur (les deux opérateurs Haïti).
  let fetched: TopupProduct[] = [];
  try {
    for (const op of OPERATORS) {
      fetched = fetched.concat(await reloadlyProvider.getProducts(op));
    }
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Appel Reloadly échoué" },
      { status: 502 }
    );
  }
  if (fetched.length === 0) {
    return NextResponse.json(
      {
        error:
          "Aucun produit renvoyé par Reloadly (opérateurs Haïti introuvables — sandbox limitée ?).",
      },
      { status: 422 }
    );
  }

  const admin = createAdminClient();
  const { data: existingRows } = await admin
    .from("zabelie_topup_products")
    .select("id, operator, face_value_htg");

  // Clé métier du catalogue : (opérateur, valeur faciale).
  const idByKey = new Map<string, string>();
  for (const r of existingRows ?? []) {
    idByKey.set(`${r.operator}:${r.face_value_htg}`, r.id as string);
  }

  let inserted = 0;
  let updated = 0;
  const seen = new Set<string>();

  for (const p of fetched) {
    const key = `${p.operator}:${p.faceValueHtg}`;
    const fields = {
      provider_product_id: p.providerProductId,
      cost_htg: p.costHtg,
      price_htg: priceFrom(p.costHtg),
      label: p.label,
      active: true,
    };

    // Doublon dans le flux (même dénomination sur 2 operatorId) : on écrase
    // la ligne déjà traitée ce tour-ci, sans re-compter.
    const dup = seen.has(key);
    const id = idByKey.get(key);

    if (id) {
      const { error } = await admin
        .from("zabelie_topup_products")
        .update(fields)
        .eq("id", id);
      if (!error && !dup) updated += 1;
    } else {
      const { data: row, error } = await admin
        .from("zabelie_topup_products")
        .insert({ operator: p.operator, face_value_htg: p.faceValueHtg, provider: "reloadly", ...fields })
        .select("id")
        .single();
      if (!error && row) {
        idByKey.set(key, row.id as string); // les doublons suivants updateront
        inserted += 1;
      }
    }
    seen.add(key);
  }

  await journaliserActeAdmin(admin, {
    actorId: user.id,
    action: "topup.sync_catalog",
    metadata: { inserted, updated },
  });
  return NextResponse.json({
    ok: true,
    inserted,
    updated,
    total: inserted + updated,
    note:
      "Coûtants = valeur faciale (placeholder Reloadly) ; affiner via le rapport de commissions (OPS_TODO). Aucune dénomination retirée.",
  });
}
