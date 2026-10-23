import test from "node:test";
import assert from "node:assert/strict";
import { idValide } from "../lib/pixels";
import { UUID_RE } from "../lib/collections";
import { t, type Lang } from "../lib/i18n";
import { database, loadRoute } from "./helpers/route-harness";

const VENDEUR = "11111111-1111-4111-8111-111111111111";
const AUTRE_VENDEUR = "22222222-2222-4222-8222-222222222222";
const IDS = { meta: "123456789012345", google: "G-AB12CD34EF", tiktok: "C4ABCDEF0123456789AB" };
const AUTRES_IDS = { meta: "987654321098765", google: "AW-ZY98XW76VU", tiktok: "C9ZYXWVU987654321CD" };
type LignePixels = { seller_id: string; meta_pixel_id: string | null; google_tag_id: string | null; tiktok_pixel_id: string | null; updated_at: string };

/** La vraie route et ses validateurs ; seules les E/S de session/base sont factices. */
function pixels(options: { lang?: Lang; acteur?: string; connecte?: boolean; compte?: 403 | 503; ecritureRefusee?: boolean } = {}) {
  const lang = options.lang ?? "fr";
  const acteur = options.acteur ?? VENDEUR;
  const controles: string[] = [];
  const ecritures: Record<string, unknown>[] = [];
  const initial: Record<string, LignePixels> = {
    [VENDEUR]: { seller_id: VENDEUR, meta_pixel_id: IDS.meta, google_tag_id: IDS.google, tiktok_pixel_id: IDS.tiktok, updated_at: "2026-10-20T10:00:00.000Z" },
    [AUTRE_VENDEUR]: { seller_id: AUTRE_VENDEUR, meta_pixel_id: AUTRES_IDS.meta, google_tag_id: AUTRES_IDS.google, tiktok_pixel_id: AUTRES_IDS.tiktok, updated_at: "2026-10-21T11:00:00.000Z" },
  };
  const etat = structuredClone(initial);
  const db = database(query => {
    assert.equal(query.table, "zabelie_seller_pixels");
    const upsert = query.steps.find(([m]) => m === "upsert");
    assert.ok(upsert, "la route conserve son écriture par la session et la RLS");
    const ligne = { ...(upsert[1][0] as LignePixels) };
    ecritures.push(ligne);
    assert.equal((upsert[1][1] as { onConflict: string }).onConflict, "seller_id");
    // Effet de base seulement : aucune garde d'identité n'est reproduite ici.
    if (!options.ecritureRefusee) etat[ligne.seller_id] = ligne;
    return { error: options.ecritureRefusee ? { code: "XX001", message: "panne factice" } : null };
  });
  const route = loadRoute("app/api/account/pixels/route.ts", {
    "@/lib/i18n-server": { getLang: async () => lang },
    "@/lib/i18n": { t },
    "@/lib/pixels": { idValide },
    "@/lib/collections": { UUID_RE },
    "@/lib/supabase/server": { createClient: async () => ({
      ...db,
      auth: { getUser: async () => ({ data: { user: options.connecte === false ? null : { id: acteur } } }) },
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
  return { envoyer, controles, ecritures, queries: db.queries, initial, etat };
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
      assert.deepEqual(f.etat, f.initial);
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
      assert.deepEqual(f.etat, f.initial);
    }
  }
});

test("pixels PUT : un champ connu non textuel est refusé, jamais interprété comme un retrait", async () => {
  for (const field of ["meta", "google", "tiktok"] as const) {
    for (const value of [null, 123456789012345, true, false, [], [IDS[field]], {}]) {
      const f = pixels();
      const response = await f.envoyer(JSON.stringify({ ...IDS, expectedActorId: VENDEUR, [field]: value }));
      assert.equal(response.status, 422, `${field} : ${JSON.stringify(value)}`);
      assert.deepEqual(await response.json(), { error: t("fr", "pixels.err.format"), code: "invalid_format", field });
      assert.equal(f.queries.length, 0);
      assert.equal(f.ecritures.length, 0);
      assert.deepEqual(f.etat, f.initial);
    }
  }
});

test("pixels PUT : normalise les identifiants et conserve exclusivement le vendeur de la session", async () => {
  const f = pixels();
  const response = await f.envoyer(JSON.stringify({
    meta: ` ${IDS.meta} `, google: " g-ab12cd34ef ", tiktok: " c4abcdef0123456789ab ", seller_id: AUTRE_VENDEUR, expectedActorId: VENDEUR,
  }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, ...IDS });
  assert.deepEqual(f.controles, [VENDEUR]);
  assert.equal(f.ecritures.length, 1);
  const { updated_at, ...ligne } = f.ecritures[0];
  assert.equal(typeof updated_at, "string");
  assert.ok(Number.isFinite(Date.parse(updated_at as string)));
  assert.deepEqual(ligne, { seller_id: VENDEUR, meta_pixel_id: IDS.meta, google_tag_id: IDS.google, tiktok_pixel_id: IDS.tiktok });
  assert.deepEqual(f.etat, { ...f.initial, [VENDEUR]: { ...ligne, updated_at } });
});

test("pixels PUT : les chaînes vides retirent volontairement les pixels", async () => {
  const f = pixels();
  const response = await f.envoyer(JSON.stringify({ meta: "", google: " \n\t ", tiktok: " ", expectedActorId: VENDEUR }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, meta: null, google: null, tiktok: null });
  assert.equal(f.ecritures.length, 1);
  assert.equal(f.ecritures[0].meta_pixel_id, null);
  assert.equal(f.ecritures[0].google_tag_id, null);
  assert.equal(f.ecritures[0].tiktok_pixel_id, null);
  assert.deepEqual(f.etat, { ...f.initial, [VENDEUR]: { seller_id: VENDEUR, meta_pixel_id: null, google_tag_id: null, tiktok_pixel_id: null, updated_at: f.ecritures[0].updated_at } });
});

test("pixels PUT : les champs omis conservent le contrat de remplacement existant", async () => {
  for (const body of [{ expectedActorId: VENDEUR }, { meta: IDS.meta, expectedActorId: VENDEUR }]) {
    const f = pixels();
    const response = await f.envoyer(JSON.stringify(body));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, meta: "meta" in body ? IDS.meta : null, google: null, tiktok: null });
    assert.equal(f.ecritures.length, 1);
    assert.equal(f.ecritures[0].google_tag_id, null);
    assert.equal(f.ecritures[0].tiktok_pixel_id, null);
    assert.deepEqual(f.etat, { ...f.initial, [VENDEUR]: { seller_id: VENDEUR, meta_pixel_id: "meta" in body ? IDS.meta : null, google_tag_id: null, tiktok_pixel_id: null, updated_at: f.ecritures[0].updated_at } });
  }
});

test("pixels PUT : un identifiant textuel hors format refuse toute écriture dans les quatre langues", async () => {
  for (const lang of ["fr", "ht", "en", "es"] as const) {
    for (const field of ["meta", "google", "tiktok"] as const) {
      const f = pixels({ lang });
      const response = await f.envoyer(JSON.stringify({ ...IDS, expectedActorId: VENDEUR, [field]: "<script>refuse</script>" }));
      assert.equal(response.status, 422);
      assert.deepEqual(await response.json(), { error: t(lang, "pixels.err.format"), code: "invalid_format", field });
      assert.equal(f.queries.length, 0);
      assert.deepEqual(f.etat, f.initial);
    }
  }
});

test("pixels PUT : authentification, suspension et état de compte indisponible restent bloquants", async () => {
  for (const [options, status, cle] of [
    [{ connecte: false }, 401, "api.auth.required"],
    [{ compte: 403 }, 403, "api.suspended"],
    [{ compte: 503 }, 503, "api.unavailable"],
  ] as const) {
    for (const raw of ["{", "null", JSON.stringify({ meta: 12 }), JSON.stringify({ ...IDS, expectedActorId: VENDEUR }), JSON.stringify({ expectedActorId: AUTRE_VENDEUR, meta: 12 })]) {
      const f = pixels(options);
      const response = await f.envoyer(raw);
      assert.equal(response.status, status);
      assert.deepEqual(await response.json(), { error: t("fr", cle) });
      assert.equal(f.queries.length, 0);
      assert.equal(f.ecritures.length, 0);
      assert.deepEqual(f.controles, status === 401 ? [] : [VENDEUR]);
      assert.deepEqual(f.etat, f.initial);
    }
  }
});

test("pixels PUT : un refus de la base ne devient jamais un succès d'enregistrement", async () => {
  const f = pixels({ ecritureRefusee: true });
  const response = await f.envoyer(JSON.stringify({ ...IDS, expectedActorId: VENDEUR }));
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: t("fr", "api.unavailable"), code: "unavailable" });
  assert.equal(f.ecritures.length, 1);
  assert.deepEqual(f.etat, f.initial);
});

test("pixels PUT identité : UUID attendu obligatoire et valide avant les champs, sans modifier A ni B", async () => {
  const observations: { lang: Lang; valeur: unknown; invalide: boolean; status: number; corps: unknown; queries: number; ecritures: number; initial: Record<string, LignePixels>; etat: Record<string, LignePixels> }[] = [];
  for (const lang of ["fr", "ht", "en", "es"] as const) {
    for (const valeur of [undefined, null, "", "pas-un-uuid", ` ${VENDEUR} `, 12, true, false, [], [VENDEUR], {}]) {
      for (const invalide of [false, true]) {
        const f = pixels({ lang });
        const response = await f.envoyer(JSON.stringify({ ...IDS, expectedActorId: valeur, ...(invalide ? { meta: 12 } : {}) }));
        observations.push({ lang, valeur, invalide, status: response.status, corps: await response.json(), queries: f.queries.length, ecritures: f.ecritures.length, initial: f.initial, etat: f.etat });
      }
    }
  }
  console.log("[pixels identité obligatoire]", JSON.stringify({ cas: observations.length, refus422: observations.filter(o => o.status === 422).length, ecritures: observations.reduce((n, o) => n + o.ecritures, 0), etatsStables: observations.filter(o => JSON.stringify(o.etat) === JSON.stringify(o.initial)).length }));
  for (const o of observations) {
    assert.equal(o.status, 422, JSON.stringify(o));
    assert.deepEqual(o.corps, { error: t(o.lang, "api.params.invalid"), code: "invalid_body" }, JSON.stringify(o));
    assert.equal(o.queries, 0);
    assert.equal(o.ecritures, 0);
    assert.deepEqual(o.etat, o.initial);
  }
});

test("pixels PUT identité : formulaire A sous session B refuse 403 et conserve les deux configurations complètes", async () => {
  const observations: { lang: Lang; status: number; corps: unknown; controles: string[]; queries: number; ecritures: Record<string, unknown>[]; initial: Record<string, LignePixels>; etat: Record<string, LignePixels> }[] = [];
  for (const lang of ["fr", "ht", "en", "es"] as const) {
    const f = pixels({ lang, acteur: AUTRE_VENDEUR });
    const response = await f.envoyer(JSON.stringify({ ...IDS, tiktok: "", expectedActorId: VENDEUR, seller_id: VENDEUR }));
    observations.push({ lang, status: response.status, corps: await response.json(), controles: f.controles, queries: f.queries.length, ecritures: f.ecritures, initial: f.initial, etat: f.etat });
  }
  console.log("[pixels formulaire A session B]", JSON.stringify(observations.map(o => ({ lang: o.lang, status: o.status, ecritures: o.ecritures, avantB: o.initial[AUTRE_VENDEUR], apresB: o.etat[AUTRE_VENDEUR] }))));
  for (const o of observations) {
    assert.equal(o.status, 403, JSON.stringify(o));
    assert.deepEqual(o.corps, { error: t(o.lang, "api.auth.required") });
    assert.deepEqual(o.controles, [AUTRE_VENDEUR]);
    assert.equal(o.queries, 0);
    assert.equal(o.ecritures.length, 0);
    assert.deepEqual(o.etat, o.initial);
  }
});

test("pixels PUT identité : le changement de compte prime sur les formats invalides des trois régies", async () => {
  const observations: { lang: Lang; status: number; corps: unknown; queries: number; ecritures: number; initial: Record<string, LignePixels>; etat: Record<string, LignePixels> }[] = [];
  for (const lang of ["fr", "ht", "en", "es"] as const) {
    const f = pixels({ lang, acteur: AUTRE_VENDEUR });
    const response = await f.envoyer(JSON.stringify({ expectedActorId: VENDEUR, seller_id: AUTRE_VENDEUR, meta: 12, google: [], tiktok: null }));
    observations.push({ lang, status: response.status, corps: await response.json(), queries: f.queries.length, ecritures: f.ecritures.length, initial: f.initial, etat: f.etat });
  }
  console.log("[pixels priorité identité]", JSON.stringify(observations.map(o => ({ lang: o.lang, status: o.status, corps: o.corps, queries: o.queries }))));
  for (const o of observations) {
    assert.equal(o.status, 403, JSON.stringify(o));
    assert.deepEqual(o.corps, { error: t(o.lang, "api.auth.required") });
    assert.equal(o.queries, 0);
    assert.equal(o.ecritures, 0);
    assert.deepEqual(o.etat, o.initial);
  }
});

test("pixels PUT identité : A/A et B/B normalisent le remplacement et ignorent seller_id sans toucher l'autre vendeur", async () => {
  for (const lang of ["fr", "ht", "en", "es"] as const) {
    for (const [acteur, autre, ids] of [[VENDEUR, AUTRE_VENDEUR, AUTRES_IDS], [AUTRE_VENDEUR, VENDEUR, IDS]] as const) {
      const f = pixels({ lang, acteur });
      const response = await f.envoyer(JSON.stringify({ expectedActorId: acteur, seller_id: autre, meta: ` ${ids.meta} `, google: ` ${ids.google.toLowerCase()} `, tiktok: ` ${ids.tiktok.toLowerCase()} ` }));
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { ok: true, ...ids });
      assert.deepEqual(f.controles, [acteur]);
      assert.equal(f.queries.length, 1);
      assert.equal(f.ecritures.length, 1);
      const updated_at = f.ecritures[0].updated_at;
      assert.equal(typeof updated_at, "string");
      assert.ok(Number.isFinite(Date.parse(updated_at as string)));
      const attendu = { seller_id: acteur, meta_pixel_id: ids.meta, google_tag_id: ids.google, tiktok_pixel_id: ids.tiktok, updated_at };
      assert.deepEqual(f.ecritures[0], attendu);
      assert.deepEqual(f.etat, { ...f.initial, [acteur]: attendu });
    }
  }
});
