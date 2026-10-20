import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { KYC_BUCKET, KYC_TYPE_PAR_EXTENSION, estTypeKyc, kycRequisPourRetrait, signatureKycValide } from "../lib/kyc";
import { isMissingFunction } from "../lib/pg-errors";
import { refus } from "./refus-forme";
import { database, loadRoute } from "./helpers/route-harness";

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
  assert.match(DEPOT, new RegExp(`if \\(!user\\)[\\s\\S]{0,200}${refus(401)}`));
  assert.match(DEPOT, new RegExp(`sub\\?\\.status === "approved"[\\s\\S]{0,200}${refus(409)}`));
  // Une pièce d'identité orpheline au stockage est un défaut de rétention.
  assert.match(DEPOT, /\.remove\(\[path\]\)/);
  // Aucune URL n'est rendue au client : le bucket est privé, par construction.
  assert.ok(!/getPublicUrl/.test(DEPOT), "aucune URL publique sur une pièce d'identité");
});

type Submission = { status: "pending" | "approved" | "rejected"; submitted_at: string; decided_at: string | null; decided_by?: string | null };
const USER = "13000000-0000-4000-8000-000000000001";
const pending = (): Submission => ({ status: "pending", submitted_at: "2026-10-05T10:00:00.000001Z", decided_at: null });
function depotFixture(options: {
  initial?: Submission | null; upload?: (state: { sub: Submission | null; active: boolean }) => void;
  rpcError?: boolean; missingRpc?: boolean | "42883"; lostResponse?: boolean; invalidResult?: boolean;
  rpcReplyError?: boolean; lateCommit?: boolean; undecidableResult?: unknown;
  readError?: boolean; cleanupError?: boolean;
} = {}) {
  const state = { sub: options.initial === undefined ? pending() : options.initial, active: true };
  const documents = new Map<string, string>();
  const objects = new Set<string>();
  const removed: string[] = [];
  const calls: Record<string, unknown>[] = [];
  let finishRegistration: (() => void) | undefined;
  const db = database(query => {
    const operation = (name: string) => query.steps.find(([method]) => method === name)?.[1];
    if (query.table === "zabelie_kyc_submissions" && operation("select")) return { data: state.sub ? { ...state.sub } : null, error: null };
    if (query.table === "zabelie_kyc_documents" && operation("select")) {
      const path = query.steps.find(([method, args]) => method === "eq" && args[0] === "storage_path")?.[1][1] as string;
      return { data: documents.has(path) ? { id: documents.get(path) } : null, error: options.readError ? { code: "offline" } : null };
    }
    // Keep the old queries executable for the known-negative audit case.
    if (query.table === "zabelie_kyc_documents" && operation("insert")) {
      const path = (operation("insert")![0] as { storage_path: string }).storage_path;
      documents.set(path, "document-legacy"); return { data: { id: "document-legacy" }, error: null };
    }
    if (query.table === "zabelie_kyc_submissions" && operation("upsert")) {
      state.sub = operation("upsert")![0] as Submission; return { error: null };
    }
    throw new Error("Unexpected query " + query.table);
  });
  const admin = {
    ...db,
    storage: { from: () => ({
      upload: async (path: string) => { objects.add(path); options.upload?.(state); return { error: null }; },
      remove: async (paths: string[]) => {
        if (options.cleanupError) return { error: { code: "offline" } };
        for (const path of paths) { objects.delete(path); removed.push(path); }
        return { error: null };
      },
    }) },
    rpc: async (name: string, args: Record<string, unknown>) => {
      assert.equal(name, "zabelie_register_kyc_document");
      assert.equal(args.p_user_id, USER); assert.equal(args.p_kind, "cin");
      const path = args.p_storage_path as string;
      assert.match(path, new RegExp(`^${USER}/[0-9a-f-]{36}\\.jpg$`));
      calls.push(args);
      if (options.missingRpc) return { error: { code: options.missingRpc === true ? "PGRST202" : options.missingRpc }, data: null };
      if (options.rpcError) throw new Error("offline");
      if (options.rpcReplyError) return { data: options.undecidableResult ?? null, error: { code: "", message: "TypeError: fetch failed" } };
      if (options.lateCommit) {
        finishRegistration = () => {
          documents.set(path, "document-late");
          state.sub = { status: "pending", submitted_at: "2026-10-05T11:00:00.000001Z", decided_at: null };
        };
        return { data: null, error: { code: "", message: "response lost while transaction is in flight" } };
      }
      if (Object.hasOwn(options, "undecidableResult")) return { data: options.undecidableResult, error: null };
      if (!state.active) return { data: { ok: false, code: "account_inactive" }, error: null };
      if (state.sub?.status === "approved") return { data: { ok: false, code: "locked" }, error: null };
      if (JSON.stringify(state.sub) !== JSON.stringify(args.p_expected)) return { data: { ok: false, code: "conflict" }, error: null };
      documents.set(path, "document-new");
      state.sub = { status: "pending", submitted_at: "2026-10-05T11:00:00.000001Z", decided_at: null };
      if (options.lostResponse) throw new Error("response lost after commit");
      return { data: options.invalidResult ? null : { ok: true, id: "document-new" }, error: null };
    },
  };
  const route = loadRoute("app/api/kyc/route.ts", {
    "@/lib/supabase/server": { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: USER } } }) } }) },
    "@/lib/supabase/admin": { createAdminClient: () => admin },
    "@/lib/auth": { requireActiveAccount: async () => null },
    "@/lib/api-erreur": { erreurTraduite: (error: string, status: number) => Response.json({ error }, { status }) },
    "@/lib/product-media": { isMissingTable: () => false },
    "@/lib/pg-errors": { isMissingFunction },
    "@/lib/kyc": { KYC_BUCKET, KYC_EXTENSIONS: new Set(["jpg"]), KYC_MAX_BYTES: 1000, KYC_TYPE_PAR_EXTENSION, estTypeKyc, signatureKycValide },
  });
  const execute = () => {
    const form = new FormData(); form.set("kind", "cin");
    form.set("file", new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), "synthetic document"], "fixture.jpg", { type: "image/jpeg" }));
    return route.POST(new Request("https://zabelie.test/api/kyc", { method: "POST", body: form }));
  };
  return { state, documents, objects, removed, calls, queries: db.queries, execute, finishRegistration: () => finishRegistration?.() };
}

test("dépôt atomique : une pièce nominale ou un dossier refusé peuvent être soumis sans exposer leur URL", async () => {
  for (const initial of [null, pending(), { ...pending(), status: "rejected" as const, decided_at: "2026-10-05T10:30:00Z" }]) {
    const f = depotFixture({ initial }); const response = await f.execute();
    assert.equal(response.status, 200); assert.deepEqual(await response.json(), { ok: true, id: "document-new", kind: "cin" });
    assert.equal(f.documents.size, 1); assert.equal(f.objects.size, 1); assert.equal(f.removed.length, 0);
    assert.equal(f.state.sub?.status, "pending"); assert.equal(f.calls.length, 1);
  }
});

test("dépôt atomique : une décision prise pendant l'envoi reste intacte et la nouvelle pièce est supprimée", async () => {
  for (const status of ["approved", "rejected"] as const) {
    const decision = { ...pending(), status, decided_at: "2026-10-05T10:30:00Z", decided_by: "admin" };
    const f = depotFixture({ upload: state => { state.sub = decision; } });
    assert.equal((await f.execute()).status, 409);
    assert.deepEqual(f.state.sub, decision); assert.equal(f.documents.size, 0); assert.equal(f.objects.size, 0); assert.equal(f.removed.length, 1);
  }
});

test("dépôt atomique : fermeture concurrente, avec ou sans dossier, ne recrée aucun pending", async () => {
  for (const initial of [null, pending()]) {
    const f = depotFixture({ initial, upload: state => {
      state.active = false;
      if (state.sub) state.sub = { ...state.sub, status: "rejected", decided_at: "2026-10-05T10:30:00Z" };
    } });
    assert.equal((await f.execute()).status, 403);
    assert.notEqual(f.state.sub?.status, "pending"); assert.equal(f.documents.size, 0); assert.equal(f.objects.size, 0);
  }
});

test("dépôt atomique : une ancienne lecture pending ne remplace pas un nouveau dépôt pending", async () => {
  const newer = { ...pending(), submitted_at: "2026-10-05T10:30:00.000002Z" };
  const f = depotFixture({ upload: state => { state.sub = newer; } });
  assert.equal((await f.execute()).status, 409); assert.deepEqual(f.state.sub, newer); assert.equal(f.objects.size, 0);
});

test("dépôt atomique : RPC absente du cache ne démarre aucune transaction et nettoie l'objet", async () => {
  const f = depotFixture({ missingRpc: true }); assert.equal((await f.execute()).status, 503);
  assert.equal(f.objects.size, 0); assert.equal(f.documents.size, 0); assert.deepEqual(f.state.sub, pending());
});

test("dépôt atomique : erreur transport ou réponse indécidable garde l'objet sans relecture d'absence", async () => {
  const cases = [
    { rpcError: true }, { rpcReplyError: true }, { missingRpc: "42883" as const },
    { rpcReplyError: true, undecidableResult: { ok: false, code: "locked" } },
    ...[null, undefined, [], {}, false, "locked", { ok: false }, { ok: false, code: "unknown" },
      { ok: true }, { ok: true, id: 12 }, { ok: "yes", id: "document" }, { code: "locked" },
      { ok: false, code: "locked", id: "document" },
      ...["account_inactive", "conflict", "locked"].map(code => ({ ok: true, id: "document", code }))].map(undecidableResult => ({ undecidableResult })),
  ];
  for (const options of cases) {
    const f = depotFixture(options); assert.equal((await f.execute()).status, 503);
    assert.equal(f.objects.size, 1); assert.equal(f.documents.size, 0); assert.equal(f.removed.length, 0);
    assert.ok(!f.queries.some(query => query.table === "zabelie_kyc_documents"), "une lecture vide ne prouve pas que la transaction est finie");
  }
});

test("dépôt atomique : une réponse perdue avant COMMIT tardif ne détruit pas la future pièce référencée", async () => {
  const f = depotFixture({ lateCommit: true });
  assert.equal((await f.execute()).status, 503);
  assert.equal(f.documents.size, 0, "la transaction initiale n'est pas encore visible à la réponse HTTP");
  f.finishRegistration();
  assert.equal(f.documents.size, 1, "la transaction initiale peut terminer après la réponse HTTP");
  assert.equal(f.objects.size, 1, "la pièce doit encore exister après ce COMMIT tardif");
  assert.equal(f.removed.length, 0);
  assert.ok(!f.queries.some(query => query.table === "zabelie_kyc_documents"));
});

test("dépôt atomique : une réponse perdue après commit ne supprime jamais la pièce déjà enregistrée", async () => {
  for (const options of [{ lostResponse: true }, { invalidResult: true }]) {
    const f = depotFixture(options); assert.equal((await f.execute()).status, 503);
    assert.equal(f.documents.size, 1); assert.equal(f.objects.size, 1); assert.equal(f.removed.length, 0);
    assert.ok(!f.queries.some(query => query.table === "zabelie_kyc_documents"));
  }
});

test("dépôt atomique : un refus métier fiable ne dépend pas d'une relecture, et un nettoyage refusé reste visible", async () => {
  const decision = { ...pending(), status: "approved" as const, decided_at: "2026-10-05T10:30:00Z" };
  const refuse = depotFixture({ readError: true, upload: state => { state.sub = decision; } });
  assert.equal((await refuse.execute()).status, 409); assert.equal(refuse.objects.size, 0); assert.equal(refuse.removed.length, 1);
  assert.ok(!refuse.queries.some(query => query.table === "zabelie_kyc_documents"));
  const echec = depotFixture({ cleanupError: true, upload: state => { state.sub = decision; } });
  assert.equal((await echec.execute()).status, 503); assert.equal(echec.objects.size, 1); assert.equal(echec.removed.length, 0);
});

test("revue : réservée aux admins, URLs SIGNÉES seulement, refus motivé, décision journalisée", () => {
  assert.match(REVUE, new RegExp(`me\\.role !== "admin"[\\s\\S]{0,160}${refus(403)}`));
  assert.match(REVUE, /createSignedUrl\(d\.storage_path, SIGNATURE_SECONDES\)/);
  assert.ok(!/getPublicUrl/.test(REVUE), "aucune URL publique côté admin non plus");
  assert.match(REVUE, new RegExp(`action === "rejected" && !note[\\s\\S]{0,200}${refus(422)}`));
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
  // La section vit sur la page Compte depuis la refonte façon Chariow (docs/73).
  const src = readFileSync("app/tableau-de-bord/compte/page.tsx", "utf8");
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
