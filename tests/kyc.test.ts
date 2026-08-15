import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { KYC_BUCKET, estTypeKyc, kycRequisPourRetrait } from "../lib/kyc";

/**
 * KYC vendeur (docs/35 V-6) — arbitrages porteur : retrait bloqué, CIN ou
 * passeport, vérification MANUELLE (aucune API haïtienne n'existe).
 *
 * Les deux propriétés qui comptent, et qu'aucune relecture ne garantit :
 * le blocage est DORMANT à l'application, et les pièces d'identité ne sont
 * jamais publiques.
 */

const SQL = readFileSync("supabase/migrations/0079_kyc_vendeur.sql", "utf8");

test("0079 : le blocage du retrait est DORMANT à l'application", () => {
  assert.match(SQL, /requis_pour_retrait boolean not null default false/);
  // Et la post-condition le REDIT en base : un défaut changé à true casse
  // l'application au lieu de couper tous les vendeurs en silence.
  assert.match(
    SQL,
    /if \(select requis_pour_retrait from zabelie_kyc_config\) then[\s\S]{0,200}raise exception/
  );
});

test("0079 : le bucket des pièces d'identité est PRIVÉ, et rien ne l'ouvre", () => {
  assert.match(SQL, /values \('kyc-documents', 'kyc-documents', false\)/);
  // Aucune policy sur storage.objects pour ce bucket — vérifié en
  // post-condition, parce qu'une policy ajoutée plus tard « pour dépanner »
  // rendrait des pièces d'identité lisibles sans que rien ne le dise.
  assert.match(SQL, /qual like '%kyc-documents%'[\s\S]{0,200}raise exception/);
});

test("0079 : la réécriture de zabelie_request_payout N'A PAS perdu le recouvrement de 0072", () => {
  // Troisième version de cette fonction d'argent. La post-condition croise sa
  // source avec les deux mécanismes qui doivent y coexister.
  assert.match(SQL, /position\('zabelie_ai_surplus' in[\s\S]{0,220}raise exception/);
  assert.match(SQL, /position\('kyc_requis' in[\s\S]{0,220}raise exception/);
  // Et le corps porte bien les deux.
  assert.match(SQL, /'ai_surplus:' \|\| v_payout_id/);
  assert.match(SQL, /'reason', 'kyc_requis'/);
});

test("0079 : la garde KYC ne coupe QUE si elle est armée ET le dossier non approuvé", () => {
  assert.match(
    SQL,
    /if coalesce\(v_kyc_requis, false\) then[\s\S]{0,300}v_kyc_statut is distinct from 'approved'/
  );
});

test("estTypeKyc : CIN, passeport, selfie — et rien d'autre", () => {
  assert.equal(estTypeKyc("cin"), true);
  assert.equal(estTypeKyc("paspo"), true);
  assert.equal(estTypeKyc("selfie"), true);
  assert.equal(estTypeKyc("permis"), false);
  assert.equal(estTypeKyc(null), false);
});

test("kycRequisPourRetrait : false sur toute dégradation — une panne ne coupe pas un retrait", async () => {
  const avec = (rep: { data?: unknown; error?: unknown }) =>
    ({
      from: () => ({ select: () => ({ maybeSingle: async () => rep }) }),
    }) as unknown as SupabaseClient;
  assert.equal(
    await kycRequisPourRetrait(avec({ data: { requis_pour_retrait: true }, error: null })),
    true
  );
  assert.equal(await kycRequisPourRetrait(avec({ data: null, error: { code: "42P01" } })), false);
  const jette = {
    from: () => {
      throw new Error("réseau");
    },
  } as unknown as SupabaseClient;
  assert.equal(await kycRequisPourRetrait(jette), false);
});

// ── Les routes : conditions avec leurs cibles ───────────────────────────────

const DEPOT = readFileSync("app/api/kyc/route.ts", "utf8");
const REVUE = readFileSync("app/api/admin/kyc/route.ts", "utf8");
const PURGE = readFileSync("app/api/kyc/purge/route.ts", "utf8");

test("dépôt : auth, dossier approuvé verrouillé, nettoyage si l'inscription échoue", () => {
  assert.match(DEPOT, /if \(!user\)[\s\S]{0,200}status: 401/);
  assert.match(DEPOT, /sub\?\.status === "approved"[\s\S]{0,200}status: 409/);
  // Une pièce d'identité orpheline au stockage est un défaut de rétention.
  assert.match(DEPOT, /\.remove\(\[path\]\)[\s\S]{0,200}status: 500/);
  // Aucune URL n'est rendue au client : le bucket est privé, par construction.
  assert.ok(!/getPublicUrl/.test(DEPOT), "aucune URL publique sur une pièce d'identité");
});

test("revue : réservée aux admins, URLs SIGNÉES seulement, refus motivé, décision journalisée", () => {
  assert.match(REVUE, /me\.role !== "admin"[\s\S]{0,120}status: 403/);
  assert.match(REVUE, /createSignedUrl\(d\.storage_path, SIGNATURE_SECONDES\)/);
  assert.ok(!/getPublicUrl/.test(REVUE), "aucune URL publique côté admin non plus");
  assert.match(REVUE, /action === "rejected" && !note[\s\S]{0,200}status: 422/);
  assert.match(REVUE, /journaliserActeAdmin\(/);
});

test("purge : les OBJETS d'abord, les LIGNES ensuite — l'ordre inverse perdrait la trace", () => {
  assert.ok(
    PURGE.indexOf(".remove(") < PURGE.indexOf("zabelie_purge_kyc_documents"),
    "supprimer les lignes avant les objets laisserait des pièces sans trace"
  );
  // Journal à chaque passage, y compris à zéro (règle d'observabilité).
  assert.match(PURGE, /if \(lignes\.length === 0\)[\s\S]{0,120}journal\(\{ purges: 0 \}\)/);
  assert.match(PURGE, /isMissingFunction\(error\)[\s\S]{0,200}purges: -1/);
});

test("le cron de purge est DÉCLARÉ — une purge sans appelant ne purge rien", () => {
  const vercel = JSON.parse(readFileSync("vercel.json", "utf8"));
  const chemins = (vercel.crons ?? []).map((c: { path: string }) => c.path);
  assert.ok(chemins.includes("/api/kyc/purge"), "cron /api/kyc/purge absent de vercel.json");
});

// ── Les surfaces ────────────────────────────────────────────────────────────

test("le formulaire vendeur ne rend JAMAIS d'image de pièce d'identité", () => {
  const src = readFileSync("components/kyc-form.tsx", "utf8");
  assert.ok(!/<img|getPublicUrl|signedUrl/.test(src), "une pièce d'identité s'affichait");
  // Il dit ce que la vérification garde AVANT de demander une pièce.
  assert.match(src, /\{labels\.why\}/);
});

test("le tableau de bord monte la section KYC, masquée sans 0079", () => {
  const src = readFileSync("app/tableau-de-bord/page.tsx", "utf8");
  assert.match(src, /\{dossierKyc && \(/);
  assert.match(src, /<KycForm[\s>]/);
});

test("le refus de retrait distingue les trois situations du vendeur", () => {
  const src = readFileSync("app/api/payouts/route.ts", "utf8");
  assert.match(src, /kyc_requis:[\s\S]{0,400}kyc_statut === "pending"/);
  assert.match(src, /kyc_statut === "rejected"/);
});

test("le bucket est nommé une seule fois, dans lib/kyc", () => {
  assert.equal(KYC_BUCKET, "kyc-documents");
  for (const f of ["app/api/kyc/route.ts", "app/api/admin/kyc/route.ts", "app/api/kyc/purge/route.ts"]) {
    const src = readFileSync(f, "utf8");
    assert.match(src, /KYC_BUCKET/, `${f} doit passer par la constante`);
    assert.ok(
      !/"kyc-documents"/.test(src),
      `${f} : nom de bucket en dur — un renommage en oublierait un`
    );
  }
});
