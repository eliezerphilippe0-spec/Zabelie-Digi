import test from "node:test";
import assert from "node:assert/strict";
import { idValide } from "../lib/pixels";
import { t, type Lang } from "../lib/i18n";
import { database, loadRoute } from "./helpers/route-harness";

const VENDEUR = "vendeur-connecte";
const IDS = { meta: "123456789012345", google: "G-AB12CD34EF", tiktok: "C4ABCDEF0123456789AB" };

/** La vraie route et ses validateurs ; seules les E/S de session/base sont factices. */
function pixels(options: { lang?: Lang; connecte?: boolean; compte?: 403 | 503; ecritureRefusee?: boolean } = {}) {
  const lang = options.lang ?? "fr";
  const controles: string[] = [];
  const ecritures: Record<string, unknown>[] = [];
  const db = database(query => {
    assert.equal(query.table, "zabelie_seller_pixels");
    const upsert = query.steps.find(([m]) => m === "upsert");
    assert.ok(upsert, "la route conserve son écriture par la session et la RLS");
    ecritures.push({ ...(upsert[1][0] as Record<string, unknown>) });
    assert.equal((upsert[1][1] as { onConflict: string }).onConflict, "seller_id");
    return { error: options.ecritureRefusee ? { code: "XX001", message: "panne factice" } : null };
  });
  const route = loadRoute("app/api/account/pixels/route.ts", {
    "@/lib/i18n-server": { getLang: async () => lang },
    "@/lib/i18n": { t },
    "@/lib/pixels": { idValide },
    "@/lib/supabase/server": { createClient: async () => ({
      ...db,
      auth: { getUser: async () => ({ data: { user: options.connecte === false ? null : { id: VENDEUR } } }) },
    }) },
    "@/lib/auth": { requireActiveAccount: async (userId: string) => {
      controles.push(userId);
      if (options.compte) return Response.json({ error: t(lang, options.compte === 403 ? "api.suspended" : "api.unavailable") }, { status: options.compte });
      return null;
    } },
  });
  const envoyer = (raw: string) => route.PUT(new Request("https://zabelie.test/api/account/pixels", {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: raw,
  }));
  return { envoyer, controles, ecritures, queries: db.queries };
}

test("pixels PUT : JSON tronqué ou absent refusé sans effacer la configuration", async () => {
  for (const lang of ["fr", "ht", "en", "es"] as const) {
    for (const raw of ["{", "", '{"meta":"123456789012345"']) {
      const f = pixels({ lang });
      const response = await f.envoyer(raw);
      assert.equal(response.status, 400, JSON.stringify(raw));
      assert.deepEqual(await response.json(), { error: t(lang, "api.json.invalid"), code: "invalid_json" });
      assert.equal(f.queries.length, 0);
      assert.equal(f.ecritures.length, 0);
    }
  }
});

test("pixels PUT : seules les formes objet sont acceptées, sans écriture sur les primitives ou tableaux", async () => {
  for (const lang of ["fr", "ht", "en", "es"] as const) {
    for (const value of [null, [], [IDS], "texte", "", 12, true, false]) {
      const f = pixels({ lang });
      const response = await f.envoyer(JSON.stringify(value));
      assert.equal(response.status, 422, JSON.stringify(value));
      assert.deepEqual(await response.json(), { error: t(lang, "api.params.invalid"), code: "invalid_body" });
      assert.equal(f.queries.length, 0);
      assert.equal(f.ecritures.length, 0);
    }
  }
});

test("pixels PUT : un champ connu non textuel est refusé, jamais interprété comme un retrait", async () => {
  for (const field of ["meta", "google", "tiktok"] as const) {
    for (const value of [null, 123456789012345, true, false, [], [IDS[field]], {}]) {
      const f = pixels();
      const response = await f.envoyer(JSON.stringify({ ...IDS, [field]: value }));
      assert.equal(response.status, 422, `${field} : ${JSON.stringify(value)}`);
      assert.deepEqual(await response.json(), { error: t("fr", "pixels.err.format"), code: "invalid_format", field });
      assert.equal(f.queries.length, 0);
      assert.equal(f.ecritures.length, 0);
    }
  }
});

test("pixels PUT : normalise les identifiants et conserve exclusivement le vendeur de la session", async () => {
  const f = pixels();
  const response = await f.envoyer(JSON.stringify({
    meta: ` ${IDS.meta} `, google: " g-ab12cd34ef ", tiktok: " c4abcdef0123456789ab ", seller_id: "autre-vendeur",
  }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, ...IDS });
  assert.deepEqual(f.controles, [VENDEUR]);
  assert.equal(f.ecritures.length, 1);
  const { updated_at, ...ligne } = f.ecritures[0];
  assert.equal(typeof updated_at, "string");
  assert.ok(Number.isFinite(Date.parse(updated_at as string)));
  assert.deepEqual(ligne, { seller_id: VENDEUR, meta_pixel_id: IDS.meta, google_tag_id: IDS.google, tiktok_pixel_id: IDS.tiktok });
});

test("pixels PUT : les chaînes vides retirent volontairement les pixels", async () => {
  const f = pixels();
  const response = await f.envoyer(JSON.stringify({ meta: "", google: " \n\t ", tiktok: " " }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, meta: null, google: null, tiktok: null });
  assert.equal(f.ecritures.length, 1);
  assert.equal(f.ecritures[0].meta_pixel_id, null);
  assert.equal(f.ecritures[0].google_tag_id, null);
  assert.equal(f.ecritures[0].tiktok_pixel_id, null);
});

test("pixels PUT : les champs omis conservent le contrat de remplacement existant", async () => {
  for (const body of [{}, { meta: IDS.meta }]) {
    const f = pixels();
    const response = await f.envoyer(JSON.stringify(body));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, meta: "meta" in body ? IDS.meta : null, google: null, tiktok: null });
    assert.equal(f.ecritures.length, 1);
    assert.equal(f.ecritures[0].google_tag_id, null);
    assert.equal(f.ecritures[0].tiktok_pixel_id, null);
  }
});

test("pixels PUT : un identifiant textuel hors format refuse toute écriture dans les quatre langues", async () => {
  for (const lang of ["fr", "ht", "en", "es"] as const) {
    for (const field of ["meta", "google", "tiktok"] as const) {
      const f = pixels({ lang });
      const response = await f.envoyer(JSON.stringify({ ...IDS, [field]: "<script>refuse</script>" }));
      assert.equal(response.status, 422);
      assert.deepEqual(await response.json(), { error: t(lang, "pixels.err.format"), code: "invalid_format", field });
      assert.equal(f.queries.length, 0);
    }
  }
});

test("pixels PUT : authentification, suspension et état de compte indisponible restent bloquants", async () => {
  for (const [options, status, cle] of [
    [{ connecte: false }, 401, "api.auth.required"],
    [{ compte: 403 }, 403, "api.suspended"],
    [{ compte: 503 }, 503, "api.unavailable"],
  ] as const) {
    const f = pixels(options);
    const response = await f.envoyer(JSON.stringify(IDS));
    assert.equal(response.status, status);
    assert.equal((await response.json()).error, t("fr", cle));
    assert.equal(f.queries.length, 0);
    assert.deepEqual(f.controles, status === 401 ? [] : [VENDEUR]);
  }
});

test("pixels PUT : un refus de la base ne devient jamais un succès d'enregistrement", async () => {
  const f = pixels({ ecritureRefusee: true });
  const response = await f.envoyer(JSON.stringify(IDS));
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: t("fr", "api.unavailable"), code: "unavailable" });
  assert.equal(f.ecritures.length, 1);
});
