import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SURPLUS_DEFAUTS,
  enregistrerSurplus,
  lireConfigSurplus,
} from "../lib/ai-billing";

/**
 * Surplus IA (docs/34) — le contrat dans les deux sens : config lisible →
 * valeurs mappées ; table absente, erreur ou exception → null, et null veut
 * dire GRATUIT (blocage au quota), jamais facturation.
 */

function adminAvecConfig(reponse: { data?: unknown; error?: unknown }) {
  return {
    from: () => ({
      select: () => ({ maybeSingle: async () => reponse }),
    }),
  } as unknown as SupabaseClient;
}

test("lireConfigSurplus : lignes mappées depuis la base", async () => {
  const admin = adminAvecConfig({
    data: { quota_gratuit_jour: 40, prix_surplus_htg: 7, plafond_jour: 150 },
    error: null,
  });
  assert.deepEqual(await lireConfigSurplus(admin), {
    quotaGratuitJour: 40,
    prixSurplusHtg: 7,
    plafondJour: 150,
  });
});

test("lireConfigSurplus : table absente (0071 non appliquée), erreur ou exception → null", async () => {
  assert.equal(
    await lireConfigSurplus(adminAvecConfig({ data: null, error: { code: "42P01" } })),
    null
  );
  assert.equal(await lireConfigSurplus(adminAvecConfig({ data: null, error: null })), null);
  const admin = {
    from: () => {
      throw new Error("réseau");
    },
  } as unknown as SupabaseClient;
  assert.equal(await lireConfigSurplus(admin), null);
});

test("enregistrerSurplus : insère vendeur + prix du moment ; erreur → false (aucune génération)", async () => {
  const inserts: unknown[] = [];
  const adminOk = {
    from: (t: string) => ({
      insert: async (ligne: unknown) => {
        inserts.push({ t, ligne });
        return { error: null };
      },
    }),
  } as unknown as SupabaseClient;
  assert.equal(await enregistrerSurplus(adminOk, "seller-1", 5), true);
  assert.deepEqual(inserts, [
    { t: "zabelie_ai_surplus", ligne: { seller_id: "seller-1", prix_htg: 5 } },
  ]);

  const adminKo = {
    from: () => ({ insert: async () => ({ error: { message: "down" } }) }),
  } as unknown as SupabaseClient;
  assert.equal(await enregistrerSurplus(adminKo, "seller-1", 5), false);
});

// ── Croisement défauts compilés ↔ défauts de 0071 (patron commission-config) ─

test("SURPLUS_DEFAUTS = les défauts de la migration 0071 — les deux replis ne divergent pas", () => {
  const sql = readFileSync("supabase/migrations/0071_ai_surplus.sql", "utf8");
  const quota = sql.match(/quota_gratuit_jour integer not null default (\d+)/);
  const prix = sql.match(/prix_surplus_htg\s+integer not null default (\d+)/);
  const plafond = sql.match(/plafond_jour\s+integer not null default (\d+)/);
  assert.ok(quota && prix && plafond, "défauts introuvables dans 0071");
  assert.equal(Number(quota![1]), SURPLUS_DEFAUTS.quotaGratuitJour);
  assert.equal(Number(prix![1]), SURPLUS_DEFAUTS.prixSurplusHtg);
  assert.equal(Number(plafond![1]), SURPLUS_DEFAUTS.plafondJour);
});

// ── 0072 — le recouvrement : les gardes structurels du chemin d'argent ──────

test("0072 : lignes verrouillées puis réglées PAR IDENTIFIANT — jamais « toutes les non réglées »", () => {
  const sql = readFileSync(
    "supabase/migrations/0072_ai_surplus_recouvrement.sql",
    "utf8"
  );
  // Le verrou porte les lignes sommées…
  assert.match(sql, /settled_at is null\s+for update/);
  // …et le marquage ne vise QUE ces lignes (la course avec une dette née
  // pendant la demande est le défaut que cette forme ferme).
  assert.match(sql, /set settled_at = now\(\)[\s\S]{0,120}where id = any\(v_surplus_ids\)/);
  // Écriture de recouvrement idempotente, au grand livre.
  assert.match(sql, /'ai_surplus:' \|\| v_payout_id/);
  // Le refus rend le NET et la dette.
  assert.match(sql, /'disponible_htg', greatest\(v_balance - v_surplus_due, 0\)/);
});

test("route payouts : le refus dit les frais IA quand ils existent, le succès remonte le recouvré", () => {
  const src = readFileSync("app/api/payouts/route.ts", "utf8");
  assert.match(src, /frais_ia_htg[\s\S]{0,120}frais IA à régler/);
  assert.match(src, /fraisIaReglesHtg: Number\(data\.frais_ia_regles_htg \?\? 0\)/);
});

// ── Le composant : consentement 402, prix du serveur seulement ──────────────

test("composant : 402 → prix affiché depuis la RÉPONSE, consentement explicite via demander(true)", () => {
  const src = readFileSync("components/ai-description-help.tsx", "utf8");
  assert.match(src, /res\.status === 402[\s\S]{0,120}setSurplusPrix\(data\.prixHtg\)/);
  assert.match(src, /demander\(true\)/);
  assert.match(src, /labels\.surplus\.replace\("\{prix\}", String\(surplusPrix\)\)/);
  // Aucun prix codé dans le composant : le serveur est la seule source.
  assert.ok(!/[0-9]+\s*HTG/.test(src), "un prix en dur s'est glissé dans le composant");
});
