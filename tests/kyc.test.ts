import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { KYC_BUCKET, KYC_TYPE_PAR_EXTENSION, estTypeKyc, kycRequisPourRetrait, signatureKycValide } from "../lib/kyc";
import { isMissingFunction } from "../lib/pg-errors";
import { UUID_RE } from "../lib/collections";
import { LANGS, t, type I18nKey, type Lang } from "../lib/i18n";
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
const OTHER_USER = "13000000-0000-4000-8000-000000000002";
const pending = (): Submission => ({ status: "pending", submitted_at: "2026-10-05T10:00:00.000001Z", decided_at: null });
type Dossier = { sub: Submission | null; active: boolean };
type Document = { id: string; user_id: string; kind: string; storage_path: string };

function pieceSynthetique(actorId = USER) {
  return new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), `synthetic document ${actorId}`], "fixture.jpg", { type: "image/jpeg" });
}

/** Construction explicite des témoins métier ; les envois bruts ne complètent jamais l'identité. */
function formulaireValide(actorId = USER) {
  const form = new FormData();
  form.set("expectedActorId", actorId);
  form.set("kind", "cin");
  form.set("file", pieceSynthetique(actorId));
  return form;
}

function depotFixture(options: {
  initial?: Submission | null; upload?: (state: Dossier) => void;
  rpcError?: boolean; missingRpc?: boolean | "42883"; lostResponse?: boolean; invalidResult?: boolean;
  rpcReplyError?: boolean; lateCommit?: boolean; undecidableResult?: unknown;
  readError?: boolean; cleanupError?: boolean;
  actorId?: string; authAbsent?: boolean; authError?: boolean; lang?: Lang; seedDocuments?: boolean;
  guardRefusal?: "suspended" | "legal" | "unavailable";
} = {}) {
  const actorId = options.actorId ?? USER;
  const lang = options.lang ?? "fr";
  const states: Record<string, Dossier> = {
    [USER]: { sub: pending(), active: true },
    [OTHER_USER]: { sub: { status: "rejected", submitted_at: "2026-10-06T09:00:00.000002Z", decided_at: "2026-10-06T10:00:00Z", decided_by: "synthetic-admin" }, active: true },
  };
  const state = states[actorId];
  assert.ok(state, "la session vise un des deux comptes fictifs");
  if (options.initial !== undefined) state.sub = options.initial;
  const documentsByUser: Record<string, Map<string, Document>> = { [USER]: new Map(), [OTHER_USER]: new Map() };
  const objectsByUser: Record<string, Set<string>> = { [USER]: new Set(), [OTHER_USER]: new Set() };
  if (options.seedDocuments) {
    for (const id of [USER, OTHER_USER]) {
      const path = `${id}/10000000-0000-4000-8000-000000000000.jpg`;
      documentsByUser[id].set(path, { id: `document-existing-${id}`, user_id: id, kind: "cin", storage_path: path });
      objectsByUser[id].add(path);
    }
  }
  // Alias historiques : les témoins de concurrence/nettoyage gardent leurs assertions.
  const documents = documentsByUser[actorId];
  const objects = objectsByUser[actorId];
  const removed: string[] = [];
  const calls: Record<string, unknown>[] = [];
  const events: string[] = [];
  const guardCalls: { userId: string; legalAcceptance: unknown }[] = [];
  const uploads: { bucket: string; path: string; bytes: number[]; sha256: string; contentType: string }[] = [];
  let handlerAdminCreations = 0;
  let finishRegistration: (() => void) | undefined;
  const db = database(query => {
    events.push(`query:${query.table}`);
    const operation = (name: string) => query.steps.find(([method]) => method === name)?.[1];
    if (query.table === "zabelie_kyc_submissions" && operation("select")) {
      const owner = query.steps.find(([method, args]) => method === "eq" && args[0] === "user_id")?.[1][1] as string;
      assert.equal(owner, actorId);
      return { data: states[owner].sub ? { ...states[owner].sub } : null, error: null };
    }
    if (query.table === "zabelie_kyc_documents" && operation("select")) {
      const path = query.steps.find(([method, args]) => method === "eq" && args[0] === "storage_path")?.[1][1] as string;
      return { data: documents.has(path) ? { id: documents.get(path)!.id } : null, error: options.readError ? { code: "offline" } : null };
    }
    // Keep the old queries executable for the known-negative audit case.
    if (query.table === "zabelie_kyc_documents" && operation("insert")) {
      const path = (operation("insert")![0] as { storage_path: string }).storage_path;
      documents.set(path, { id: "document-legacy", user_id: actorId, kind: "cin", storage_path: path }); return { data: { id: "document-legacy" }, error: null };
    }
    if (query.table === "zabelie_kyc_submissions" && operation("upsert")) {
      state.sub = operation("upsert")![0] as Submission; return { error: null };
    }
    throw new Error("Unexpected query " + query.table);
  });
  const admin = {
    ...db,
    storage: { from: (bucket: string) => ({
      upload: async (path: string, file: File, config: { contentType: string }) => {
        events.push("upload");
        assert.equal(bucket, KYC_BUCKET);
        assert.ok(path.startsWith(`${actorId}/`));
        const bytes = new Uint8Array(await file.arrayBuffer());
        uploads.push({ bucket, path, bytes: Array.from(bytes), sha256: createHash("sha256").update(bytes).digest("hex"), contentType: config.contentType });
        objects.add(path); options.upload?.(state); return { error: null };
      },
      remove: async (paths: string[]) => {
        events.push("remove");
        if (options.cleanupError) return { error: { code: "offline" } };
        for (const path of paths) { objects.delete(path); removed.push(path); }
        return { error: null };
      },
    }) },
    rpc: async (name: string, args: Record<string, unknown>) => {
      events.push("register");
      assert.equal(name, "zabelie_register_kyc_document");
      assert.equal(args.p_user_id, actorId); assert.equal(args.p_kind, "cin");
      const path = args.p_storage_path as string;
      assert.match(path, new RegExp(`^${actorId}/[0-9a-f-]{36}\\.jpg$`));
      calls.push(args);
      if (options.missingRpc) return { error: { code: options.missingRpc === true ? "PGRST202" : options.missingRpc }, data: null };
      if (options.rpcError) throw new Error("offline");
      if (options.rpcReplyError) return { data: options.undecidableResult ?? null, error: { code: "", message: "TypeError: fetch failed" } };
      if (options.lateCommit) {
        finishRegistration = () => {
          documents.set(path, { id: "document-late", user_id: actorId, kind: "cin", storage_path: path });
          state.sub = { status: "pending", submitted_at: "2026-10-05T11:00:00.000001Z", decided_at: null };
        };
        return { data: null, error: { code: "", message: "response lost while transaction is in flight" } };
      }
      if (Object.hasOwn(options, "undecidableResult")) return { data: options.undecidableResult, error: null };
      if (!state.active) return { data: { ok: false, code: "account_inactive" }, error: null };
      if (state.sub?.status === "approved") return { data: { ok: false, code: "locked" }, error: null };
      if (JSON.stringify(state.sub) !== JSON.stringify(args.p_expected)) return { data: { ok: false, code: "conflict" }, error: null };
      documents.set(path, { id: "document-new", user_id: actorId, kind: "cin", storage_path: path });
      state.sub = { status: "pending", submitted_at: "2026-10-05T11:00:00.000001Z", decided_at: null };
      if (options.lostResponse) throw new Error("response lost after commit");
      return { data: options.invalidResult ? null : { ok: true, id: "document-new" }, error: null };
    },
  };
  const route = loadRoute("app/api/kyc/route.ts", {
    "@/lib/supabase/server": { createClient: async () => ({ auth: { getUser: async () => {
      events.push("auth");
      return { data: { user: options.authAbsent ? null : { id: actorId } }, error: options.authError ? { message: "synthetic auth failure" } : null };
    } } }) },
    "@/lib/supabase/admin": { createAdminClient: () => { events.push("handler-admin"); handlerAdminCreations++; return admin; } },
    "@/lib/auth": { requireActiveAccount: async (userId: string, config: { legalAcceptance?: boolean }) => {
      events.push("account-guard");
      guardCalls.push({ userId, legalAcceptance: config.legalAcceptance });
      assert.equal(userId, actorId); assert.equal(config.legalAcceptance, true);
      if (options.guardRefusal === "suspended") return Response.json({ error: t(lang, "api.suspended"), code: "suspended" }, { status: 403 });
      if (options.guardRefusal === "legal") return Response.json({ error: t(lang, "auth.legal.required"), code: "legal_acceptance_required", next: "/connexion?mode=legal" }, { status: 403 });
      if (options.guardRefusal === "unavailable") return Response.json({ error: t(lang, "api.unavailable"), code: "account_status_unavailable" }, { status: 503 });
      return null;
    } },
    "@/lib/api-erreur": { erreurTraduite: (key: I18nKey, status: number, extra?: Record<string, unknown>) => Response.json({ error: t(lang, key), ...extra }, { status }) },
    "@/lib/collections": { UUID_RE },
    "@/lib/product-media": { isMissingTable: () => false },
    "@/lib/pg-errors": { isMissingFunction },
    "@/lib/kyc": { KYC_BUCKET, KYC_EXTENSIONS: new Set(["jpg"]), KYC_MAX_BYTES: 1000, KYC_TYPE_PAR_EXTENSION, estTypeKyc, signatureKycValide },
  });
  const envoyerRequete = (request: Request) => route.POST(request);
  const envoyer = (form: FormData) => envoyerRequete(new Request("https://zabelie.test/api/kyc", { method: "POST", body: form }));
  const snapshot = () => ({
    states: structuredClone(states),
    documents: Object.fromEntries(Object.entries(documentsByUser).map(([id, rows]) => [id, Array.from(rows.values()).map(row => ({ ...row }))])),
    objects: Object.fromEntries(Object.entries(objectsByUser).map(([id, paths]) => [id, Array.from(paths)])),
  });
  return { state, documents, objects, removed, calls, queries: db.queries, events, guardCalls, uploads, snapshot,
    handlerAdminCreations: () => handlerAdminCreations, envoyer, envoyerRequete,
    execute: () => envoyer(formulaireValide(actorId)), finishRegistration: () => finishRegistration?.() };
}

function aucunEffetKyc(f: ReturnType<typeof depotFixture>, avant: ReturnType<ReturnType<typeof depotFixture>["snapshot"]>) {
  assert.equal(f.handlerAdminCreations(), 0, "aucun client admin propre au handler KYC");
  assert.equal(f.queries.length, 0, "aucune lecture de dossier KYC");
  assert.deepEqual(f.uploads, []);
  assert.deepEqual(f.calls, []);
  assert.deepEqual(f.removed, []);
  assert.deepEqual(f.snapshot(), avant);
}

test("dépôt identité : un écran A ne dépose pas sa pièce dans le dossier B de la nouvelle session", async () => {
  for (const lang of LANGS) {
    const f = depotFixture({ actorId: OTHER_USER, lang, seedDocuments: true });
    const avant = f.snapshot();
    const form = formulaireValide(USER);
    const bytesA = new Uint8Array(await (form.get("file") as File).arrayBuffer());
    const shaA = createHash("sha256").update(bytesA).digest("hex");
    const response = await f.envoyer(form);
    const body = await response.json();
    if (response.status === 200) {
      // Ancienne route : les E/S doivent prouver l'association erronée avant l'attente rouge403.
      assert.deepEqual(body, { ok: true, id: "document-new", kind: "cin" });
      assert.equal(f.uploads.length, 1);
      assert.equal(f.uploads[0].bucket, KYC_BUCKET);
      assert.ok(f.uploads[0].path.startsWith(`${OTHER_USER}/`));
      assert.deepEqual(f.uploads[0].bytes, Array.from(bytesA));
      assert.equal(f.uploads[0].sha256, shaA);
      assert.equal(f.calls.length, 1);
      assert.equal(f.calls[0].p_user_id, OTHER_USER);
      assert.equal(f.calls[0].p_storage_path, f.uploads[0].path);
      assert.deepEqual(f.calls[0].p_expected, avant.states[OTHER_USER].sub);
      assert.equal(f.state.sub?.status, "pending");
      assert.equal(f.documents.size, 2);
      assert.deepEqual(f.documents.get(f.uploads[0].path), { id: "document-new", user_id: OTHER_USER, kind: "cin", storage_path: f.uploads[0].path });
      assert.equal(f.objects.size, 2);
      const apres = f.snapshot();
      assert.deepEqual(apres.states[USER], avant.states[USER]);
      assert.deepEqual(apres.documents[USER], avant.documents[USER]);
      assert.deepEqual(apres.objects[USER], avant.objects[USER]);
    }
    assert.equal(response.status, 403, JSON.stringify({ lang, expectedActorId: USER, session: OTHER_USER, uploads: f.uploads, rpc: f.calls, dossiers: f.snapshot() }));
    assert.deepEqual(body, { error: t(lang, "api.auth.required") });
    assert.deepEqual(f.guardCalls, [{ userId: OTHER_USER, legalAcceptance: true }]);
    assert.deepEqual(f.events, ["auth", "account-guard"]);
    aucunEffetKyc(f, avant);
  }
});

test("dépôt identité : un multipart ancien sans identité attendue échoue avant le fichier et l'admin KYC", async () => {
  for (const lang of LANGS) {
    for (const avecPiece of [true, false]) {
      const f = depotFixture({ lang, seedDocuments: true });
      const avant = f.snapshot();
      const form = avecPiece ? formulaireValide() : new FormData();
      form.delete("expectedActorId");
      const response = await f.envoyer(form);
      assert.equal(response.status, 422, JSON.stringify({ lang, avecPiece, uploads: f.uploads, rpc: f.calls }));
      assert.deepEqual(await response.json(), { error: t(lang, "api.params.invalid") });
      aucunEffetKyc(f, avant);
    }
  }
});

test("dépôt identité : une identité multipart mal formée, même un File, ne crée aucun objet privé", async () => {
  for (const lang of LANGS) {
    for (const expectedActorId of ["", "invalide", ` ${USER} `, "null", "true", JSON.stringify([USER]), new File(["synthetic identifier"], "actor.txt")]) {
      const f = depotFixture({ lang, seedDocuments: true });
      const avant = f.snapshot();
      const form = formulaireValide();
      form.set("expectedActorId", expectedActorId);
      const response = await f.envoyer(form);
      assert.equal(response.status, 422, JSON.stringify({ lang, expectedActorId: typeof expectedActorId === "string" ? expectedActorId : "File", uploads: f.uploads, rpc: f.calls }));
      assert.deepEqual(await response.json(), { error: t(lang, "api.params.invalid") });
      aucunEffetKyc(f, avant);
    }
  }
});

test("dépôt identité : A/A et B/B gardent la session seule propriétaire malgré des cibles forgées", async () => {
  for (const actorId of [USER, OTHER_USER]) {
    for (const initial of [null, pending(), { ...pending(), status: "rejected" as const, decided_at: "2026-10-05T10:30:00Z" }]) {
      const otherId = actorId === USER ? OTHER_USER : USER;
      const f = depotFixture({ actorId, initial });
      const avant = f.snapshot();
      const form = formulaireValide(actorId);
      for (const key of ["user_id", "userId", "p_user_id", "id"]) form.set(key, otherId);
      const expectedBytes = new Uint8Array(await (form.get("file") as File).arrayBuffer());
      const response = await f.envoyer(form);
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { ok: true, id: "document-new", kind: "cin" });
      assert.deepEqual(f.guardCalls, [{ userId: actorId, legalAcceptance: true }]);
      assert.equal(f.handlerAdminCreations(), 1);
      assert.equal(f.queries.length, 1);
      assert.equal(f.calls.length, 1);
      assert.equal(f.calls[0].p_user_id, actorId);
      assert.deepEqual(f.calls[0].p_expected, initial);
      assert.equal(f.uploads.length, 1);
      const upload = f.uploads[0];
      assert.equal(upload.bucket, KYC_BUCKET);
      assert.ok(upload.path.startsWith(`${actorId}/`));
      assert.deepEqual(upload.bytes, Array.from(expectedBytes));
      assert.equal(upload.sha256, createHash("sha256").update(expectedBytes).digest("hex"));
      assert.equal(upload.contentType, KYC_TYPE_PAR_EXTENSION.jpg);
      assert.equal(f.calls[0].p_storage_path, upload.path);
      assert.deepEqual(f.documents.get(upload.path), { id: "document-new", user_id: actorId, kind: "cin", storage_path: upload.path });
      assert.ok(f.objects.has(upload.path));
      assert.equal(f.state.sub?.status, "pending");
      assert.equal(f.removed.length, 0);
      const apres = f.snapshot();
      assert.deepEqual(apres.states[otherId], avant.states[otherId]);
      assert.deepEqual(apres.documents[otherId], avant.documents[otherId]);
      assert.deepEqual(apres.objects[otherId], avant.objects[otherId]);
    }
  }
});

test("dépôt identité : Auth, suspension et acceptation légale restent prioritaires sur multipart et identité", async () => {
  const cases = [
    { options: { authAbsent: true }, status: 401, key: "api.auth.required", extra: {} },
    { options: { authAbsent: true, authError: true }, status: 401, key: "api.auth.required", extra: {} },
    { options: { guardRefusal: "suspended" }, status: 403, key: "api.suspended", extra: { code: "suspended" } },
    { options: { guardRefusal: "legal" }, status: 403, key: "auth.legal.required", extra: { code: "legal_acceptance_required", next: "/connexion?mode=legal" } },
    { options: { guardRefusal: "unavailable" }, status: 503, key: "api.unavailable", extra: { code: "account_status_unavailable" } },
  ] as const;
  for (const lang of LANGS) {
    for (const scenario of cases) {
      for (const multipartValide of [false, true]) {
        const f = depotFixture({ ...scenario.options, actorId: OTHER_USER, lang, seedDocuments: true });
        const avant = f.snapshot();
        const response = multipartValide ? await f.envoyer(formulaireValide(USER))
          : await f.envoyerRequete(new Request("https://zabelie.test/api/kyc", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{" }));
        assert.equal(response.status, scenario.status);
        assert.deepEqual(await response.json(), { error: t(lang, scenario.key), ...scenario.extra });
        const absent = "authAbsent" in scenario.options;
        assert.deepEqual(f.events, absent ? ["auth"] : ["auth", "account-guard"]);
        assert.deepEqual(f.guardCalls, absent ? [] : [{ userId: OTHER_USER, legalAcceptance: true }]);
        aucunEffetKyc(f, avant);
      }
    }
  }
});

test("dépôt identité : avec identité valide, les refus multipart, fichier et dossier gardent leurs quatre traductions", async () => {
  for (const lang of LANGS) {
    const invalid = depotFixture({ lang });
    const malformed = await invalid.envoyerRequete(new Request("https://zabelie.test/api/kyc", { method: "POST", body: "{" }));
    assert.equal(malformed.status, 400);
    assert.deepEqual(await malformed.json(), { error: t(lang, "api.form.invalid") });
    assert.equal(invalid.handlerAdminCreations(), 0);
    const cases: { edit?: (form: FormData) => void; initial?: Submission; status: number; key: I18nKey; reads: number }[] = [
      { edit: form => { form.delete("file"); }, status: 400, key: "api.kyc.doc.required", reads: 0 },
      { edit: form => { form.set("kind", "permis"); }, status: 400, key: "api.kyc.doc.required", reads: 0 },
      { edit: form => { form.set("file", new File([], "empty.jpg")); }, status: 422, key: "api.kyc.size", reads: 0 },
      // La fixture garde son plafond1000octets historique ; aucune nouvelle borne produit.
      { edit: form => { form.set("file", new File([new Uint8Array(1001)], "large.jpg")); }, status: 422, key: "api.kyc.size", reads: 0 },
      { edit: form => { form.set("file", new File(["synthetic"], "file.txt")); }, status: 422, key: "api.kyc.format", reads: 0 },
      { edit: form => { form.set("file", new File(["synthetic"], "invalid.jpg")); }, status: 422, key: "api.kyc.format", reads: 0 },
      { initial: { ...pending(), status: "approved", decided_at: "2026-10-05T10:30:00Z" }, status: 409, key: "api.kyc.locked", reads: 1 },
    ];
    for (const scenario of cases) {
      const f = depotFixture({ lang, initial: scenario.initial });
      const avant = f.snapshot();
      const form = formulaireValide();
      scenario.edit?.(form);
      const response = await f.envoyer(form);
      assert.equal(response.status, scenario.status);
      assert.deepEqual(await response.json(), { error: t(lang, scenario.key) });
      assert.equal(f.handlerAdminCreations(), scenario.reads);
      assert.equal(f.queries.length, scenario.reads);
      assert.deepEqual(f.uploads, []); assert.deepEqual(f.calls, []); assert.deepEqual(f.removed, []);
      assert.deepEqual(f.snapshot(), avant);
    }
  }
});

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
