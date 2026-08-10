import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { estTokenFacture, invoiceToken } from "@/lib/business";

/**
 * LE JETON DE FACTURE A UNE FORME, ET LA PAGE LA VÉRIFIE AVANT LA BASE.
 *
 * Constat d'un audit externe (2026-08-10), retenu après vérification :
 * /facture/[token] transmettait n'importe quelle chaîne à une RPC
 * `security definer` — sans borne de longueur, sans format, sans débit.
 * L'entropie du jeton (144 bits) rend l'énumération irréaliste ; le
 * durcissement ne défend pas contre elle, il rend le scan VISIBLE et borné,
 * et épargne à la base les chaînes arbitraires.
 */

test("la garde accepte tout jeton réellement émis", () => {
  // Connu-positif : cent jetons frais, tous doivent passer. Si `invoiceToken`
  // change de forme un jour, ce test rougit AVANT que les factures ne
  // deviennent introuvables en production.
  for (let i = 0; i < 100; i++) {
    const t = invoiceToken();
    assert.ok(estTokenFacture(t), `jeton émis refusé : ${t}`);
    assert.equal(t.length, 24);
  }
});

test("la garde refuse ce qui ne ressemble pas à un jeton", () => {
  for (const v of [
    "",
    "abc",
    "a".repeat(23),
    "a".repeat(25),
    "a".repeat(1000),
    "ABCDEFGHIJKLMNOPQRSTUVW+", // `+` : base64 classique, pas base64url
    "ABCDEFGHIJKLMNOPQRSTUVW=", // padding
    "ABCDEFGHIJKLMNOPQRSTUVW'", // apostrophe — la famille injection
    "ABCDEFGHIJKLMNOPQRST•123", // la puce de l'incident anon key
    null,
    undefined,
    42,
  ]) {
    assert.ok(!estTokenFacture(v), `accepté à tort : ${String(v)}`);
  }
});

test("la page appelle la garde et la borne AVANT la RPC", () => {
  // Même limite assumée que home-empty-state : on lit la source, on ne rend
  // pas un Server Component. La propriété vérifiée est l'ORDRE — une garde
  // écrite après l'appel protégerait le néant.
  const src = readFileSync("app/facture/[token]/page.tsx", "utf8");
  const iGarde = src.indexOf("estTokenFacture(token)");
  const iDebit = src.indexOf("rateLimit(admin");
  const iRpc = src.indexOf("zabelie_biz_get_invoice_by_token");
  assert.ok(iGarde > -1, "la page n'appelle plus estTokenFacture");
  assert.ok(iDebit > -1, "la page n'a plus de borne de débit");
  assert.ok(iRpc > iGarde && iRpc > iDebit, "garde ou borne écrites APRÈS la RPC");
});
