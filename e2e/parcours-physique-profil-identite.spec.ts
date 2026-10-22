import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { randomUUID, createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { t, type Lang } from "../lib/i18n";
import type { KycType } from "../lib/kyc";

// Vrais page/composant/POST ; seuls Auth/PostgREST sont simulés localement.
// Le journal prouve les effets du handler, pas les règles SQL/RLS de production.
const STUB = "http://127.0.0.1:15421";
type Profile = { id: string; display_name: string; bio: string; avatar_url: string | null; country_code: string; region_code: string | null; zone_id: string | null; pwen_repe: string; boutik_slug: string | null };
type ProfileState = { profiles: Profile[]; writes: { id: string; kind: string; patch: Record<string, unknown> }[]; slugReads: { id: string }[];
  zones?: { id: string; parent_id: string | null; level: string }[];
  zoneRequests?: { tokenActorId: string; row: { id: string; requester: string; komin_id: string; nom_propose: string; status: string } }[];
  accountClosure?: ClosureState; deliveryInfo?: DeliveryState; kyc?: KycState };
type KycSubmission = { user_id: string; status: string; submitted_at: string; decided_at: string | null; decided_by: string | null; note_admin: string | null };
type KycDocument = { id: string; user_id: string; kind: KycType; storage_path: string; created_at: string };
type KycObject = { user_id: string; bucket: string; path: string; sha256: string; size: number; contentType: string };
type KycState = { submissions: KycSubmission[]; documents: KycDocument[]; objects: KycObject[];
  reads: { table: string; owner: string; select: string; serviceRole: boolean; rows: Record<string, unknown>[] }[];
  uploads: (KycObject & { multipart: boolean; fileName: string; serviceRole: boolean })[];
  rpcs: { name: string; args: { p_user_id: string; p_kind: KycType; p_storage_path: string; p_expected: Record<string, unknown> }; result: { ok: boolean; id: string }; serviceRole: boolean }[];
  removals: { path: string; serviceRole: boolean }[] };
type DeliveryRow = { user_id: string; full_name: string | null; phone: string | null; adres_liv: string | null; updated_at?: string };
type DeliveryState = { rows: DeliveryRow[];
  reads: { tokenActorId: string | null; requestedActorId: string; select: string | null; serviceRole: boolean; row: DeliveryRow | null }[];
  upserts: { tokenActorId: string | null; serviceRole: boolean; row: DeliveryRow }[] };
type ClosureMode = "history" | "empty";
type ClosureState = {
  mode: ClosureMode;
  events: { actorId: string; kind: string; metric?: string; count?: number; scope?: string; serviceRole?: boolean; patch?: Record<string, unknown> }[];
  profileReads: { actorId: string; select: string }[];
  counts: Record<string, { purchases: number; sales: number; kyc: number; acceptances: number }>;
  authUsers: { id: string; email: string; user_metadata: Record<string, unknown>; deleted: boolean; ban_duration: string | null }[];
  kycSubmissions: { user_id: string; status: string; note_admin: string | null; decided_at: string | null }[];
  favorites: { user_id: string; product_id: string }[];
  follows: { user_id: string; seller_id: string }[];
};
const diagnostics = new WeakMap<Page, { errors: string[]; console: { type: string; text: string; url: string }[] }>();
const expectedZoneRefusals = new WeakSet<Page>();
const expectedAccountRefusals = new WeakSet<Page>();
const expectedDeliveryRefusals = new WeakSet<Page>();
const expectedKycRefusals = new WeakSet<Page>();
test.beforeEach(async ({ page }) => {
  const result = { errors: [] as string[], console: [] as { type: string; text: string; url: string }[] };
  diagnostics.set(page, result);
  page.on("pageerror", error => result.errors.push(error.message));
  page.on("console", message => {
    if (["error", "warning"].includes(message.type())) result.console.push({ type: message.type(), text: message.text(), url: message.location().url });
  });
});
test.afterEach(async ({ page }) => {
  const result = diagnostics.get(page)!;
  await test.info().attach("profile-browser-diagnostics", { body: JSON.stringify(result, null, 2), contentType: "application/json" });
  expect(result.errors).toEqual([]);
  // Chromium reports deliberately refused stale POSTs as console errors.
  expect(result.console.filter(message => !(message.type === "error" && /\b403\b/.test(message.text)
    && (message.url.includes("/api/profile") || (expectedZoneRefusals.has(page) && message.url.includes("/api/zones/request"))
      || (expectedAccountRefusals.has(page) && message.url.endsWith("/api/account"))
      || (expectedDeliveryRefusals.has(page) && message.url.endsWith("/api/delivery-info"))
      || (expectedKycRefusals.has(page) && message.url.endsWith("/api/kyc")))))).toEqual([]);
  await expect(page.locator("nextjs-portal, [data-nextjs-dialog-overlay], [data-nextjs-error-overlay]")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

async function fixture(request: APIRequestContext, withZones = false, accountClosure?: ClosureMode, deliveryInfo = false, kyc = false) {
  const scenario = randomUUID(), actorA = randomUUID(), actorB = randomUUID();
  const initialized = await request.post(`${STUB}/__profile-identity`, { data: { scenario, actorA, actorB,
    ...(withZones ? { withZones: true } : {}), ...(accountClosure ? { accountClosure } : {}), ...(deliveryInfo ? { deliveryInfo: true } : {}), ...(kyc ? { kyc: true } : {}) } });
  expect(initialized.status()).toBe(200);
  return { actorA, actorB, state: async (): Promise<ProfileState> => (await request.get(`${STUB}/__profile-identity?scenario=${scenario}`)).json() };
}
async function session(page: Page, actorId: string, lang: Lang = "fr", domain = "127.0.0.1") {
  const sessionValue = { access_token: `profile-identity-${actorId}`, refresh_token: "fixture", token_type: "bearer", expires_at: 4102444800, expires_in: 3600,
    user: { id: actorId, aud: "authenticated", role: "authenticated" } };
  await page.context().addCookies([
    { name: "sb-127-auth-token", value: "base64-" + Buffer.from(JSON.stringify(sessionValue)).toString("base64url"), domain, path: "/" },
    { name: "zabelie_lang", value: lang, domain, path: "/" },
  ]);
}
async function openProfile(page: Page, name: string, lang: Lang = "fr") {
  await page.goto("/tableau-de-bord/boutique");
  await expect(page.getByRole("heading", { level: 1, name: t(lang, "shop.manage"), exact: true })).toBeVisible();
  await expect(page.locator("#profil-nom")).toHaveValue(name);
}
function profileBody(profile: Profile) {
  return { display_name: profile.display_name, bio: profile.bio, avatar_url: profile.avatar_url ?? "", country_code: profile.country_code,
    region_code: profile.region_code ?? "", zone_id: profile.zone_id ?? "", pwen_repe: profile.pwen_repe };
}
async function captureAtTop(page: Page, name: string) {
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await page.screenshot({ path: test.info().outputPath(name), fullPage: true });
}
const profileResponse = (page: Page) => page.waitForResponse(response => new URL(response.url()).pathname === "/api/profile" && response.request().method() === "POST");

async function prepareZoneRequest(page: Page, initial: ProfileState, name: string, lang: Lang = "fr") {
  const zones = page.getByRole("group", { name: t(lang, "zone.form.title"), exact: true });
  await zones.getByRole("combobox", { name: t(lang, "zone.level.depatman"), exact: true }).selectOption(initial.zones![0].id);
  await zones.getByRole("combobox", { name: t(lang, "zone.level.komin"), exact: true }).selectOption(initial.zones![1].id);
  await zones.getByPlaceholder(t(lang, "zone.req.ph"), { exact: true }).fill(name);
}
const zoneResponse = (page: Page) => page.waitForResponse(response => new URL(response.url()).pathname === "/api/zones/request" && response.request().method() === "POST");

for (const lang of ["fr", "ht", "en", "es"] as const) {
  test(`quartier : formulaire A sous cookies B refuse la demande (${lang})`, async ({ page, request }) => {
    const f = await fixture(request, true); const initial = await f.state();
    await page.setViewportSize({ width: 360, height: 900 }); await session(page, f.actorA, lang);
    await openProfile(page, initial.profiles[0].display_name, lang);
    const name = `Quartier privé A ${lang}`;
    await prepareZoneRequest(page, initial, name, lang);
    const before = await f.state();
    await session(page, f.actorB, lang); expectedZoneRefusals.add(page);
    const pending = zoneResponse(page);
    await page.getByRole("button", { name: t(lang, "zone.req.btn"), exact: true }).click();
    const response = await pending; const body = await response.json(); const after = await f.state();
    console.log(JSON.stringify({ scenario: "comptes fictifs : demande quartier A vers session B", lang,
      status: response.status(), expectedActorId: response.request().postDataJSON().expectedActorId ?? null,
      actorA: f.actorA, actorB: f.actorB, zoneRequests: after.zoneRequests,
      profilesUnchanged: JSON.stringify(after.profiles) === JSON.stringify(before.profiles),
      zonesUnchanged: JSON.stringify(after.zones) === JSON.stringify(before.zones) }));
    expect(response.status()).toBe(403);
    expect(after).toEqual(before);
    expect(response.request().postDataJSON().expectedActorId).toBe(f.actorA);
    expect(body.error).toBe(t(lang, "api.auth.required"));
    await expect(page.getByText(t(lang, "zone.req.err"), { exact: true })).toBeVisible();
    await expect(page.getByPlaceholder(t(lang, "zone.req.ph"), { exact: true })).toHaveValue(name);
    if (lang === "fr") await captureAtTop(page, "quartier-identite-refus-360.png");
  });
}

test("quartier : demandes A et B et client ancien restent attribuées à leur compte", async ({ page, request }) => {
  const f = await fixture(request, true); const initial = await f.state();
  await page.setViewportSize({ width: 1280, height: 900 });
  for (const [index, actorId] of [f.actorA, f.actorB].entries()) {
    await session(page, actorId); await openProfile(page, initial.profiles[index].display_name);
    const name = `Quartier fictif ${index}`;
    await prepareZoneRequest(page, initial, name);
    const pending = zoneResponse(page);
    await page.getByRole("button", { name: t("fr", "zone.req.btn"), exact: true }).click();
    const response = await pending; expect(response.status()).toBe(200);
    expect(response.request().postDataJSON().expectedActorId).toBe(actorId);
    await expect(page.getByText(t("fr", "zone.req.ok"), { exact: true })).toBeVisible();
    await expect(page.getByPlaceholder(t("fr", "zone.req.ph"), { exact: true })).toHaveValue("");
    const saved = await f.state();
    expect(saved.zoneRequests).toHaveLength(index + 1);
    expect(saved.zoneRequests![index]).toMatchObject({ tokenActorId: actorId,
      row: { requester: actorId, komin_id: initial.zones![1].id, nom_propose: name, status: "pending" } });
    expect(saved.profiles).toEqual(initial.profiles); expect(saved.zones).toEqual(initial.zones); expect(saved.writes).toEqual([]);
  }
  const legacy = await page.request.post("/api/zones/request", { data: { kominId: initial.zones![1].id, nom: "Quartier ancien client B" } });
  expect(legacy.status()).toBe(200);
  const saved = await f.state();
  expect(saved.zoneRequests).toHaveLength(3);
  expect(saved.zoneRequests![2]).toMatchObject({ tokenActorId: f.actorB,
    row: { requester: f.actorB, komin_id: initial.zones![1].id, nom_propose: "Quartier ancien client B", status: "pending" } });
  expect(saved.profiles).toEqual(initial.profiles); expect(saved.zones).toEqual(initial.zones); expect(saved.writes).toEqual([]);
  console.log(JSON.stringify({ scenario: "comptes fictifs : demandes quartier nominales et ancien client", zoneRequests: saved.zoneRequests, zones: saved.zones }));
  await captureAtTop(page, "quartier-identite-succes-1280.png");
});

for (const lang of ["fr", "ht", "en", "es"] as const) {
  test(`profil : formulaire A sous cookies B refuse toute écriture (${lang})`, async ({ page, request }) => {
    const f = await fixture(request);
    await page.setViewportSize({ width: 360, height: 900 }); await session(page, f.actorA, lang);
    const initial = await f.state();
    await openProfile(page, initial.profiles[0].display_name, lang);
    await page.locator("#profil-nom").fill(`Saisie privée A ${lang}`);
    await page.locator("#profil-bio").fill(`Présentation privée A ${lang}`);
    const before = await f.state();
    await session(page, f.actorB, lang);
    const pending = profileResponse(page);
    await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
    const response = await pending; const body = await response.json();
    const after = await f.state();
    console.log(JSON.stringify({ scenario: "comptes fictifs : profil A vers session B", lang, status: response.status(), expectedActorId: response.request().postDataJSON().expectedActorId ?? null,
      profileWrites: after.writes.filter(write => write.kind === "profile").length, slugWrites: after.writes.filter(write => write.kind === "slug").length,
      profilesUnchanged: JSON.stringify(after.profiles) === JSON.stringify(before.profiles), before, after }));
    expect(response.status()).toBe(403);
    expect(response.request().postDataJSON().expectedActorId).toBe(f.actorA);
    expect(body.error).toBe(t(lang, "api.auth.required"));
    await expect(page.getByText(t(lang, "api.auth.required"), { exact: true })).toBeVisible();
    if (lang === "fr") await captureAtTop(page, "profil-identite-refus-360.png");
    expect(after).toEqual(before);
    await expect(page.locator("#profil-nom")).toHaveValue(`Saisie privée A ${lang}`);
    await page.reload();
    await expect(page.locator("#profil-nom")).toHaveValue(initial.profiles[1].display_name);
    await expect(page.locator("#profil-bio")).toHaveValue(initial.profiles[1].bio);
    await expect(page.locator("#profil-pays")).toHaveValue("US");
  });
}

test("profil : sauvegardes A et B et client ancien gardent leur propre identité", async ({ page, request }) => {
  const f = await fixture(request); await page.setViewportSize({ width: 1280, height: 900 });
  const initial = await f.state();
  for (const [index, actorId] of [f.actorA, f.actorB].entries()) {
    await session(page, actorId); await openProfile(page, initial.profiles[index].display_name);
    const name = `Profil sauvegardé ${index}`;
    await page.locator("#profil-nom").fill(name);
    const pending = profileResponse(page); await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
    const response = await pending; expect(response.status()).toBe(200);
    expect(response.request().postDataJSON().expectedActorId).toBe(actorId);
    await expect(page.getByText("Profil mis à jour.", { exact: true })).toBeVisible();
    const state = await f.state(); expect(state.profiles[index].display_name).toBe(name);
    expect(state.writes.filter(write => write.kind === "profile").map(write => write.id)).toEqual([f.actorA, f.actorB].slice(0, index + 1));
    expect(state.profiles[index].boutik_slug).toBeTruthy();
  }
  const beforeLegacy = await f.state();
  const legacy = await page.request.post("/api/profile", { data: { ...profileBody(beforeLegacy.profiles[1]), display_name: "Profil ancien client B" } });
  expect(legacy.status()).toBe(200);
  const afterLegacy = await f.state();
  expect(afterLegacy.profiles[0]).toEqual(beforeLegacy.profiles[0]);
  expect(afterLegacy.profiles[1].display_name).toBe("Profil ancien client B");
  expect(afterLegacy.profiles[1].boutik_slug).toBe(beforeLegacy.profiles[1].boutik_slug);
  await page.reload(); await expect(page.locator("#profil-nom")).toHaveValue("Profil ancien client B");
  await captureAtTop(page, "profil-identite-succes-1280.png");
});

test("profil : le refresh SSR après sauvegarde A remonte les champs B dans le même document", async ({ page, request }) => {
  const f = await fixture(request); const initial = await f.state();
  await session(page, f.actorA); await openProfile(page, initial.profiles[0].display_name);
  await page.evaluate(() => {
    document.documentElement.dataset.profileIdentityDocument = "same-document";
    const original = window.fetch.bind(window);
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    const pending = { committed: false, release };
    (window as unknown as { profileIdentityPending: typeof pending }).profileIdentityPending = pending;
    window.fetch = async (...args) => {
      const response = await original(...args);
      const target = args[0] instanceof Request ? args[0].url : String(args[0]);
      if (new URL(target, location.href).pathname === "/api/profile" && args[1]?.method === "POST") {
        await response.clone().arrayBuffer(); pending.committed = true; await held;
      }
      return response;
    };
  });
  try {
    await page.locator("#profil-nom").fill("Sauvegarde autorisée A");
    await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
    await page.waitForFunction(() => (window as unknown as { profileIdentityPending: { committed: boolean } }).profileIdentityPending.committed);
    const committed = await f.state();
    expect(committed.profiles[0].display_name).toBe("Sauvegarde autorisée A");
    expect(committed.profiles[1]).toEqual(initial.profiles[1]);
    await session(page, f.actorB);
    const refreshed = page.waitForResponse(response => new URL(response.url()).pathname === "/tableau-de-bord/boutique" && response.request().headers().rsc === "1");
    await page.evaluate(() => (window as unknown as { profileIdentityPending: { release: () => void } }).profileIdentityPending.release());
    await refreshed;
    await expect(page.locator("html")).toHaveAttribute("data-profile-identity-document", "same-document");
    await expect(page.locator("#profil-nom")).toHaveValue(initial.profiles[1].display_name);
    await expect(page.locator("#profil-bio")).toHaveValue(initial.profiles[1].bio);
    await expect(page.locator("#profil-pays")).toHaveValue("US");
    expect((await f.state()).profiles[1]).toEqual(initial.profiles[1]);
  } finally {
    await page.evaluate(() => (window as unknown as { profileIdentityPending?: { release: () => void } }).profileIdentityPending?.release());
  }
});

// next start construit le renvoi absolu signout sur localhost. Les seuls
// nouveaux cas Compte utilisent cette même origine, sans réécrire le 303.
const ACCOUNT_ORIGIN = "http://localhost:3001";
const removeAccountButton = (page: Page) => page.locator("#donnees").getByRole("button", { name: "Supprimer mon compte", exact: true });
async function openAccount(page: Page, lang: Lang = "fr") {
  await page.goto(`${ACCOUNT_ORIGIN}/tableau-de-bord/compte`);
  await expect(page.getByRole("heading", { level: 1, name: t(lang, "vendeur.nav.compte"), exact: true })).toBeVisible();
  await expect(removeAccountButton(page)).toBeEnabled();
}
async function accountConfirmation(page: Page, accept: boolean) {
  const pending = page.waitForEvent("dialog");
  const clicked = removeAccountButton(page).click();
  const dialog = await pending;
  const type = dialog.type();
  if (accept) await dialog.accept(); else await dialog.dismiss();
  await clicked;
  expect(type).toBe("confirm");
}
function assertNoClosureEffects(before: ProfileState, after: ProfileState) {
  // Une lecture SSR tardive peut encore observer le profil de l'écran A.
  // Elle n'est ni une création admin, un compteur, ni un effet de fermeture.
  const effects = (state: ProfileState) => ({ ...state,
    accountClosure: Object.fromEntries(Object.entries(state.accountClosure!).filter(([key]) => key !== "profileReads")) });
  expect(effects(after)).toEqual(effects(before));
}
function assertClosedOwner(before: ProfileState, after: ProfileState, actorId: string, mode: ClosureMode) {
  const initial = before.accountClosure!, saved = after.accountClosure!;
  const authBefore = initial.authUsers.find(user => user.id === actorId)!;
  const authAfter = saved.authUsers.find(user => user.id === actorId)!;
  expect(saved.events.every(event => event.actorId === actorId)).toBe(true);
  expect(saved.events.filter(event => event.kind === "count").map(event => [event.metric, event.count]).sort())
    .toEqual(Object.entries(initial.counts[actorId]).sort());
  const other = initial.authUsers.find(user => user.id !== actorId)!.id;
  expect(saved.authUsers.find(user => user.id === other)).toEqual(initial.authUsers.find(user => user.id === other));
  expect(after.profiles.find(profile => profile.id === other)).toEqual(before.profiles.find(profile => profile.id === other));
  expect(saved.events.filter(event => event.kind === "auth.signout")).toEqual([{ actorId, kind: "auth.signout", scope: "global" }]);
  if (mode === "empty") {
    expect(saved.events.filter(event => event.kind !== "count").map(event => event.kind).sort()).toEqual(["auth.delete", "auth.signout"]);
    expect(saved.events.find(event => event.kind === "auth.delete"))
      .toMatchObject({ actorId, patch: { should_soft_delete: false }, serviceRole: true });
    expect(authAfter.deleted).toBe(true);
  } else {
    expect(saved.events.filter(event => event.kind !== "count").map(event => event.kind).sort())
      .toEqual(["auth.signout", "auth.update", "favorites.delete", "follows.delete", "kyc.update", "orders.read", "profile.update"]);
    expect(after.profiles.find(profile => profile.id === actorId)).toMatchObject({
      display_name: "Compte supprimé", bio: null, avatar_url: null, country_code: null,
      region_code: null, zone_id: null, pwen_repe: null, boutik_slug: null,
      suspended_reason: "account_closed", suspended_at: expect.any(String), suspended_by: null,
    });
    expect(authAfter).toMatchObject({ deleted: false, email: `deleted+${actorId}@deleted.invalid`, ban_duration: "876000h",
      user_metadata: Object.fromEntries(Object.keys(authBefore.user_metadata).map(key => [key, null])) });
    expect(saved.events.find(event => event.kind === "auth.update")).toMatchObject({ actorId, serviceRole: true });
    expect(saved.kycSubmissions.find(row => row.user_id === actorId))
      .toMatchObject({ status: "rejected", decided_at: expect.any(String), note_admin: "Compte fermé avant décision" });
    expect(saved.favorites).toEqual(initial.favorites.filter(row => row.user_id !== actorId));
    expect(saved.follows).toEqual(initial.follows.filter(row => row.user_id !== actorId));
    expect(saved.kycSubmissions.filter(row => row.user_id !== actorId)).toEqual(initial.kycSubmissions.filter(row => row.user_id !== actorId));
  }
}

for (const [lang, mode, width] of [["fr", "history", 360], ["ht", "empty", 1280], ["en", "history", 360], ["es", "empty", 1280]] as const) {
  test(`fermeture : écran A sous cookies B refuse la branche ${mode} (${lang})`, async ({ page, request }) => {
    const f = await fixture(request, false, mode);
    await page.setViewportSize({ width, height: 900 }); await session(page, f.actorA, lang, "localhost"); await openAccount(page, lang);
    const before = await f.state();
    expect(before.accountClosure!.profileReads.some(read => read.actorId === f.actorA)).toBe(true);
    expect(before.accountClosure!.events).toEqual([]);
    await session(page, f.actorB, lang, "localhost"); expectedAccountRefusals.add(page);
    const calls: string[] = [];
    page.on("request", request => {
      const path = new URL(request.url()).pathname;
      if ((path === "/api/account" && request.method() === "DELETE") || (path === "/api/auth/signout" && request.method() === "POST")) calls.push(`${request.method()} ${path}`);
    });
    const pending = page.waitForResponse(response => new URL(response.url()).pathname === "/api/account" && response.request().method() === "DELETE");
    await accountConfirmation(page, true);
    const response = await pending; const body = await response.json(); const after = await f.state();
    const rawBody = response.request().postData();
    const expectedActorId = rawBody ? JSON.parse(rawBody).expectedActorId ?? null : null;
    console.log(JSON.stringify({ scenario: "comptes fictifs : fermeture A vers session B", lang, mode, status: response.status(),
      response: body, expectedActorId, actorA: f.actorA, actorB: f.actorB, events: after.accountClosure!.events,
      targetProfile: after.profiles.find(profile => profile.id === f.actorB), targetAuth: after.accountClosure!.authUsers.find(user => user.id === f.actorB) }));
    // Sur le build ancien, constater les vrais effets B avant le rouge403.
    if (response.status() === 200) {
      expect(body.mode).toBe(mode === "history" ? "anonymized" : "deleted");
      assertClosedOwner(before, after, f.actorB, mode);
    }
    expect(response.status()).toBe(403);
    assertNoClosureEffects(before, after);
    expect(expectedActorId).toBe(f.actorA);
    expect(body.error).toBe(t(lang, "api.auth.required"));
    await expect(page.getByText(t(lang, "api.auth.required"), { exact: true })).toBeVisible();
    await expect(removeAccountButton(page)).toBeEnabled();
    expect(calls).toEqual(["DELETE /api/account"]);
    if (lang === "fr" || lang === "ht") await captureAtTop(page, `fermeture-identite-refus-${width}.png`);
  });
}

test("fermeture : annuler la confirmation conserve les deux comptes sans DELETE", async ({ page, request }) => {
  const f = await fixture(request, false, "history"); await session(page, f.actorA, "fr", "localhost"); await openAccount(page);
  const before = await f.state(); await session(page, f.actorB, "fr", "localhost");
  const calls: string[] = [];
  page.on("request", request => { if (new URL(request.url()).pathname === "/api/account" && request.method() === "DELETE") calls.push(request.method()); });
  await accountConfirmation(page, false);
  await expect(removeAccountButton(page)).toBeEnabled();
  expect(calls).toEqual([]); assertNoClosureEffects(before, await f.state());
});

for (const mode of ["history", "empty"] as const) {
  test(`fermeture : confirmation A et B, anciens corps refusés (${mode})`, async ({ page, request }) => {
    for (const client of ["A", "B", "absent", "emptyBody"] as const) {
      const f = await fixture(request, false, mode);
      const actorId = client === "A" ? f.actorA : f.actorB;
      await session(page, actorId, "fr", "localhost"); await openAccount(page);
      const before = await f.state();
      if (client === "absent" || client === "emptyBody") {
        const response = await page.request.delete(`${ACCOUNT_ORIGIN}/api/account`, client === "emptyBody" ? { data: {} } : {});
        expect(response.status()).toBe(400);
        expect((await response.json()).error).toEqual(expect.any(String));
        const after = await f.state(); assertNoClosureEffects(before, after);
        console.log(JSON.stringify({ scenario: "comptes fictifs : fermeture sans intention refusée", client, mode,
          status: response.status(), events: after.accountClosure!.events }));
        continue;
      }
      const calls: string[] = [];
      page.on("request", request => {
        const path = new URL(request.url()).pathname;
        if ((path === "/api/account" && request.method() === "DELETE") || (path === "/api/auth/signout" && request.method() === "POST")) calls.push(`${request.method()} ${path}`);
      });
      const pending = page.waitForResponse(response => new URL(response.url()).pathname === "/api/account" && response.request().method() === "DELETE");
      const signoutPending = page.waitForResponse(response => new URL(response.url()).pathname === "/api/auth/signout" && response.request().method() === "POST");
      await accountConfirmation(page, true);
      const response = await pending;
      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(response.request().postDataJSON()).toEqual({ expectedActorId: actorId });
      expect(body).toEqual({ ok: true, mode: mode === "history" ? "anonymized" : "deleted" });
      const signout = await signoutPending;
      expect(signout.status()).toBe(303);
      expect(signout.request().method()).toBe("POST");
      await expect(page).toHaveURL(`${ACCOUNT_ORIGIN}/`);
      const authCookies = (await page.context().cookies(ACCOUNT_ORIGIN)).filter(cookie => /^sb-.*-auth-token(?:\.\d+)?$/.test(cookie.name));
      expect(authCookies).toEqual([]);
      expect(calls).toEqual(["DELETE /api/account", "POST /api/auth/signout"]);
      const after = await f.state(); assertClosedOwner(before, after, actorId, mode);
      console.log(JSON.stringify({ scenario: "comptes fictifs : fermeture autorisée", client, mode, actorId, response: body,
        signout: { status: signout.status(), method: signout.request().method(), remainingAuthCookies: authCookies.length }, events: after.accountClosure!.events }));
    }
  });
}

const deliveryForm = (page: Page) => page.locator("#livraison form");
const deliveryFields = (page: Page, lang: Lang = "fr") => ({
  fullName: deliveryForm(page).getByRole("textbox", { name: t(lang, "profile.liv.fullname"), exact: true }),
  phone: deliveryForm(page).getByRole("textbox", { name: t(lang, "profile.liv.phone"), exact: true }),
  adresLiv: deliveryForm(page).getByRole("textbox", { name: t(lang, "profile.liv.adres"), exact: true }),
});
const deliveryBody = (row: DeliveryRow) => ({ fullName: row.full_name ?? "", phone: row.phone ?? "", adresLiv: row.adres_liv ?? "" });
const deliveryResponse = (page: Page) => page.waitForResponse(response => new URL(response.url()).pathname === "/api/delivery-info" && response.request().method() === "POST");
async function expectDeliveryFields(page: Page, row: DeliveryRow, lang: Lang = "fr") {
  const fields = deliveryFields(page, lang);
  await expect(fields.fullName).toHaveValue(row.full_name ?? "");
  await expect(fields.phone).toHaveValue(row.phone ?? "");
  await expect(fields.adresLiv).toHaveValue(row.adres_liv ?? "");
}
async function fillDelivery(page: Page, values: { fullName: string; phone: string; adresLiv: string }, lang: Lang = "fr") {
  const fields = deliveryFields(page, lang);
  await fields.fullName.fill(values.fullName); await fields.phone.fill(values.phone); await fields.adresLiv.fill(values.adresLiv);
}
async function openDelivery(page: Page, row: DeliveryRow, lang: Lang = "fr") {
  await page.goto(`${ACCOUNT_ORIGIN}/tableau-de-bord/compte`, { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { level: 1, name: t(lang, "vendeur.nav.compte"), exact: true })).toBeVisible();
  await expectDeliveryFields(page, row, lang);
}
function assertNoDeliveryEffects(before: ProfileState, after: ProfileState) {
  const effects = (state: ProfileState) => ({ ...state,
    deliveryInfo: Object.fromEntries(Object.entries(state.deliveryInfo!).filter(([key]) => key !== "reads")) });
  expect(effects(after)).toEqual(effects(before));
}

for (const [lang, width] of [["fr", 360], ["ht", 1280], ["en", 360], ["es", 1280]] as const) {
  test(`livraison : formulaire A sous cookies B refuse les coordonnées privées (${lang})`, async ({ page, request }) => {
    const f = await fixture(request, false, undefined, true);
    const initial = await f.state(), a = initial.deliveryInfo!.rows.find(row => row.user_id === f.actorA)!;
    await page.setViewportSize({ width, height: 900 }); await session(page, f.actorA, lang, "localhost"); await openDelivery(page, a, lang);
    const values = { fullName: `Saisie privée A ${f.actorA.slice(0, 8)}`, phone: "+509 3700 0099", adresLiv: "Adresse privée saisie depuis A" };
    await fillDelivery(page, values, lang);
    const before = await f.state();
    expect(before.deliveryInfo!.reads.some(read => read.requestedActorId === f.actorA && read.serviceRole && read.row?.user_id === f.actorA)).toBe(true);
    await session(page, f.actorB, lang, "localhost"); expectedDeliveryRefusals.add(page);
    const pending = deliveryResponse(page);
    await deliveryForm(page).getByRole("button", { name: t(lang, "profile.liv.save"), exact: true }).click();
    const response = await pending, body = await response.json(), after = await f.state();
    const expectedActorId = response.request().postDataJSON().expectedActorId ?? null;
    console.log(JSON.stringify({ scenario: "comptes fictifs : livraison A vers session B", lang, status: response.status(), expectedActorId,
      actorA: f.actorA, actorB: f.actorB, upserts: after.deliveryInfo!.upserts }));
    // Constater le vrai200 et l'écrasement B avant l'attente403 du build ancien.
    if (response.status() === 200) {
      expect(body).toEqual({ ok: true });
      expect(after.deliveryInfo!.upserts).toEqual([{ tokenActorId: f.actorB, serviceRole: false,
        row: { user_id: f.actorB, full_name: values.fullName, phone: values.phone, adres_liv: values.adresLiv, updated_at: expect.any(String) } }]);
      expect(after.deliveryInfo!.rows.find(row => row.user_id === f.actorB))
        .toMatchObject({ user_id: f.actorB, full_name: values.fullName, phone: values.phone, adres_liv: values.adresLiv });
      expect(after.deliveryInfo!.rows.find(row => row.user_id === f.actorA)).toEqual(a);
    }
    expect(response.status()).toBe(403);
    expect(expectedActorId).toBe(f.actorA);
    expect(body.error).toBe(t(lang, "api.auth.required"));
    assertNoDeliveryEffects(before, after);
    await expect(deliveryForm(page).getByText(t(lang, "sell.galerie.error"), { exact: true })).toBeVisible();
    await expect(deliveryForm(page).getByRole("button", { name: t(lang, "profile.liv.save"), exact: true })).toBeEnabled();
    if (lang === "fr" || lang === "ht") await captureAtTop(page, `livraison-identite-refus-${width}.png`);
  });
}

test("livraison : sauvegardes A et B, effacement et anciens corps refusés sans upsert", async ({ page, request }) => {
  for (const actor of ["A", "B"] as const) {
    const f = await fixture(request, false, undefined, true), initial = await f.state();
    const actorId = actor === "A" ? f.actorA : f.actorB, otherId = actor === "A" ? f.actorB : f.actorA;
    const row = initial.deliveryInfo!.rows.find(row => row.user_id === actorId)!;
    await session(page, actorId, "fr", "localhost"); await openDelivery(page, row);
    const values = { fullName: `Destinataire modifié ${actor}`, phone: `Téléphone privé ${actor}`, adresLiv: `Adresse privée modifiée ${actor}` };
    await fillDelivery(page, values);
    let pending = deliveryResponse(page);
    await deliveryForm(page).getByRole("button", { name: t("fr", "profile.liv.save"), exact: true }).click();
    const response = await pending;
    expect(response.status()).toBe(200);
    expect(response.request().postDataJSON()).toEqual({ ...values, expectedActorId: actorId });
    await expect(deliveryForm(page).getByText(t("fr", "profile.liv.saved"), { exact: true })).toBeVisible();
    let after = await f.state();
    expect(after.deliveryInfo!.upserts).toEqual([{ tokenActorId: actorId, serviceRole: false,
      row: { user_id: actorId, full_name: values.fullName, phone: values.phone, adres_liv: values.adresLiv, updated_at: expect.any(String) } }]);
    if (actor === "A") {
      await fillDelivery(page, { fullName: "", phone: "", adresLiv: "" });
      pending = deliveryResponse(page);
      await deliveryForm(page).getByRole("button", { name: t("fr", "profile.liv.save"), exact: true }).click();
      expect((await pending).status()).toBe(200);
    } else {
      // Champs omis = effacement conservé ; user_id forgé ne choisit jamais le propriétaire.
      expect((await page.request.post(`${ACCOUNT_ORIGIN}/api/delivery-info`, { data: { expectedActorId: actorId, user_id: otherId } })).status()).toBe(200);
    }
    after = await f.state();
    expect(after.deliveryInfo!.rows.find(row => row.user_id === actorId)).toMatchObject({ full_name: null, phone: null, adres_liv: null });
    expect(after.deliveryInfo!.rows.find(row => row.user_id === otherId)).toEqual(initial.deliveryInfo!.rows.find(row => row.user_id === otherId));
    expect(after.deliveryInfo!.upserts).toHaveLength(2);
    expect(after.deliveryInfo!.upserts.every(write => write.tokenActorId === actorId && write.row.user_id === actorId && !write.serviceRole)).toBe(true);
    for (const data of [{}, { fullName: "Ancien client sans acteur" }, { expectedActorId: "pas-un-uuid", fullName: "Acteur malformé" }]) {
      const before = await f.state();
      const refused = await page.request.post(`${ACCOUNT_ORIGIN}/api/delivery-info`, { data });
      expect(refused.status()).toBe(422);
      expect((await refused.json()).error).toBe(t("fr", "api.params.invalid"));
      assertNoDeliveryEffects(before, await f.state());
    }
    console.log(JSON.stringify({ scenario: "comptes fictifs : livraison autorisée et effacée", actor, upserts: after.deliveryInfo!.upserts, legacyRefusals: 3 }));
  }
});

test("livraison : le refresh LangToggle remonte B dans le même document avant son POST", async ({ page, request }) => {
  const f = await fixture(request, false, undefined, true), initial = await f.state();
  const a = initial.deliveryInfo!.rows.find(row => row.user_id === f.actorA)!, b = initial.deliveryInfo!.rows.find(row => row.user_id === f.actorB)!;
  await page.setViewportSize({ width: 1280, height: 900 }); await session(page, f.actorA, "fr", "localhost"); await openDelivery(page, a);
  const typedA = { fullName: "Saisie privée A avant refresh", phone: "+509 3700 0044", adresLiv: "Adresse saisie A avant refresh" };
  await fillDelivery(page, typedA);
  const beforeRefresh = await f.state();
  const sentinel = randomUUID(); await page.evaluate(value => { document.documentElement.dataset.deliveryIdentityDocument = value; }, sentinel);
  await session(page, f.actorB, "fr", "localhost");
  const pendingRsc = page.waitForResponse(response => new URL(response.url()).pathname === "/tableau-de-bord/compte" && response.request().headers().rsc === "1");
  const menu = page.locator("header:visible details").filter({ has: page.getByRole("button", { name: "Français FR", exact: true, includeHidden: true }) });
  await menu.locator("summary").click(); await menu.getByRole("button", { name: "English EN", exact: true }).click();
  const rsc = await pendingRsc; expect(rsc.status()).toBe(200);
  expect(rsc.headers()["content-type"]).toContain("text/x-component");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("heading", { level: 1, name: t("en", "vendeur.nav.compte"), exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.dataset.deliveryIdentityDocument)).toBe(sentinel);
  const refreshed = await f.state();
  const newReads = refreshed.deliveryInfo!.reads.slice(beforeRefresh.deliveryInfo!.reads.length);
  const bRead = newReads.find(read => read.requestedActorId === f.actorB && read.serviceRole);
  expect(bRead?.row).toEqual(b);
  expect(bRead?.select?.replace(/\s/g, "")).toBe("full_name,phone,adres_liv");
  console.log(JSON.stringify({ scenario: "comptes fictifs : livraison refresh SSR B", rscStatus: rsc.status(), sameDocument: true,
    rscContentType: rsc.headers()["content-type"], newReads, serverFullName: b.full_name,
    browserFullName: await deliveryFields(page, "en").fullName.inputValue(), upserts: refreshed.deliveryInfo!.upserts }));
  await expectDeliveryFields(page, b, "en");
  const pending = deliveryResponse(page);
  await deliveryForm(page).getByRole("button", { name: t("en", "profile.liv.save"), exact: true }).click();
  const response = await pending;
  expect(response.status()).toBe(200);
  expect(response.request().postDataJSON()).toEqual({ ...deliveryBody(b), expectedActorId: f.actorB });
  await expect(deliveryForm(page).getByText(t("en", "profile.liv.saved"), { exact: true })).toBeVisible();
  const after = await f.state();
  expect(after.deliveryInfo!.upserts).toEqual([{ tokenActorId: f.actorB, serviceRole: false, row: { ...b, updated_at: expect.any(String) } }]);
  expect(after.deliveryInfo!.rows.find(row => row.user_id === f.actorA)).toEqual(a);
  console.log(JSON.stringify({ scenario: "comptes fictifs : livraison après refresh B sauvegardée", expectedActorId: f.actorB, upserts: after.deliveryInfo!.upserts }));
});

const KYC_PNG = readFileSync("e2e/fixtures/cover.png");
const KYC_SHA256 = createHash("sha256").update(KYC_PNG).digest("hex");
const kycSection = (page: Page) => page.locator("#verification");
const kycInput = (page: Page, kind: KycType, lang: Lang = "fr") => kycSection(page).getByLabel(`${t(lang, "kyc.add")} : ${t(lang, `kyc.${kind}`)}`, { exact: true });
const kycPieceText = (kind: KycType, lang: Lang = "fr") => `${t(lang, `kyc.${kind}`)} — ${t(lang, "kyc.deposited")}`;
const kycResponse = (page: Page) => page.waitForResponse(response => new URL(response.url()).pathname === "/api/kyc" && response.request().method() === "POST");
const fictitiousKycFile = (actor: "A" | "B") => ({ name: `identite-fictive-${actor}.png`, mimeType: "image/png", buffer: KYC_PNG });
async function openKyc(page: Page, kind: KycType, lang: Lang = "fr") {
  await page.goto(`${ACCOUNT_ORIGIN}/tableau-de-bord/compte`, { waitUntil: "networkidle" });
  await expect(kycSection(page).getByRole("heading", { name: t(lang, "kyc.title"), exact: true })).toBeVisible();
  await expect(kycSection(page).getByRole("listitem")).toHaveText([kycPieceText(kind, lang)]);
  await expect(kycSection(page).getByText(t(lang, "kyc.pending"), { exact: true })).toBeVisible();
  await page.evaluate(() => {
    const forms: FormData[] = [];
    (window as unknown as { kycObservedForms: FormData[] }).kycObservedForms = forms;
    for (const method of ["set", "append"] as const) {
      const original = FormData.prototype[method];
      FormData.prototype[method] = function (this: FormData, ...args: [string, string | Blob, string?]) {
        const result = Reflect.apply(original, this, args);
        if (!forms.includes(this)) forms.push(this);
        return result;
      };
    }
  });
}
async function observedKycIntent(page: Page, kind: KycType, actor: "A" | "B") {
  // CDP n'expose pas ce corps multipart avec File. Observer les mutations
  // natives de FormData, sans remplacer fetch ni modifier un argument.
  const forms = await page.evaluate(({ kind, fileName }) => {
    return (window as unknown as { kycObservedForms: FormData[] }).kycObservedForms
      .filter(form => form.get("kind") === kind && form.get("file") instanceof File && (form.get("file") as File).name === fileName)
      .map(form => ({ values: form.getAll("expectedActorId").map(value => typeof value === "string" ? value : { file: true }) }));
  }, { kind, fileName: fictitiousKycFile(actor).name });
  expect(forms).toHaveLength(1);
  expect(forms[0].values).toHaveLength(1);
  expect(typeof forms[0].values[0]).toBe("string");
  return { expectedActorId: forms[0].values[0] as string, cardinality: forms[0].values.length };
}
function assertNoKycEffects(before: ProfileState, after: ProfileState) {
  const effects = (state: ProfileState) => ({ ...state, kyc: Object.fromEntries(Object.entries(state.kyc!).filter(([key]) => key !== "reads")) });
  expect(effects(after)).toEqual(effects(before));
}
function assertKycUploaded(before: ProfileState, after: ProfileState, owner: string, kind: KycType, id: string) {
  const initial = before.kyc!, saved = after.kyc!, sub = initial.submissions.find(row => row.user_id === owner)!;
  const upload = saved.uploads.at(-1)!;
  expect(saved.uploads).toHaveLength(initial.uploads.length + 1);
  expect(saved.uploads.slice(0, -1)).toEqual(initial.uploads);
  expect(upload).toMatchObject({ user_id: owner, bucket: "kyc-documents", sha256: KYC_SHA256, size: KYC_PNG.length,
    contentType: "image/png", multipart: true, serviceRole: true });
  expect(upload.path).toMatch(new RegExp(`^${owner}/[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\\.png$`));
  expect(saved.objects).toEqual([...initial.objects, { user_id: owner, bucket: "kyc-documents", path: upload.path, sha256: KYC_SHA256, size: KYC_PNG.length, contentType: "image/png" }]);
  expect(saved.documents).toEqual([...initial.documents, { id, user_id: owner, kind, storage_path: upload.path, created_at: expect.any(String) }]);
  expect(saved.rpcs).toEqual([...initial.rpcs, { name: "zabelie_register_kyc_document", serviceRole: true,
    args: { p_user_id: owner, p_kind: kind, p_storage_path: upload.path,
      p_expected: { status: sub.status, submitted_at: sub.submitted_at, decided_at: sub.decided_at, decided_by: sub.decided_by } }, result: { ok: true, id } }]);
  expect(saved.submissions).toEqual(initial.submissions.map(row => row.user_id === owner
    ? { ...row, status: "pending", submitted_at: expect.any(String), decided_at: null, decided_by: null } : row));
  expect(saved.submissions.find(row => row.user_id === owner)!.submitted_at).not.toBe(sub.submitted_at);
  // Tous les autres champs restent identiques, y compris d'éventuels futurs
  // journaux d'effets ; seules les lectures GET sont diagnostiques.
  expect({ ...after, kyc: { ...saved, reads: initial.reads, uploads: initial.uploads, objects: initial.objects,
    documents: initial.documents, rpcs: initial.rpcs, submissions: initial.submissions } }).toEqual(before);
}

for (const [lang, width] of [["fr", 360], ["ht", 1280], ["en", 360], ["es", 1280]] as const) {
  test(`KYC : écran A sous cookies B refuse le fichier privé (${lang})`, async ({ page, request }) => {
    const f = await fixture(request, false, undefined, false, true);
    await page.setViewportSize({ width, height: 900 }); await session(page, f.actorA, lang, "localhost"); await openKyc(page, "cin", lang);
    const before = await f.state(); await session(page, f.actorB, lang, "localhost"); expectedKycRefusals.add(page);
    const pending = kycResponse(page); await kycInput(page, "selfie", lang).setInputFiles(fictitiousKycFile("A"));
    const response = await pending, body = await response.json(), after = await f.state();
    console.log(JSON.stringify({ scenario: "comptes fictifs : fichier KYC A vers session B", lang, status: response.status(),
      actorA: f.actorA, actorB: f.actorB, fileSha256: KYC_SHA256, uploads: after.kyc!.uploads, rpcs: after.kyc!.rpcs }));
    if (response.status() === 200) {
      expect(body).toEqual({ ok: true, id: expect.any(String), kind: "selfie" });
      assertKycUploaded(before, after, f.actorB, "selfie", body.id);
    }
    expect(response.status()).toBe(403);
    expect(await observedKycIntent(page, "selfie", "A")).toEqual({ expectedActorId: f.actorA, cardinality: 1 });
    expect(body.error).toBe(t(lang, "api.auth.required"));
    assertNoKycEffects(before, after);
    const newReads = after.kyc!.reads.slice(before.kyc!.reads.length);
    expect(newReads.some(read => read.owner === f.actorB && read.table === "profiles" && read.serviceRole)).toBe(true);
    expect(newReads.some(read => read.owner === f.actorB && read.table === "zabelie_policy_acceptances" && read.rows.length === 2)).toBe(true);
    expect(newReads.filter(read => read.table === "zabelie_kyc_submissions" && read.select.replace(/\s/g, "") === "status,submitted_at,decided_at,decided_by")).toEqual([]);
    await expect(kycSection(page).getByText(t(lang, "api.auth.required"), { exact: true })).toBeVisible();
    await expect(kycInput(page, "selfie", lang)).toBeEnabled();
    await expect(kycSection(page).locator("img")).toHaveCount(0);
    if (lang === "fr" || lang === "ht") await captureAtTop(page, `kyc-identite-refus-${width}.png`);
  });
}

test("KYC : dépôts A et B restent privés, anciens formulaires refusés sans upload", async ({ page, request }) => {
  for (const actor of ["A", "B"] as const) {
    const f = await fixture(request, false, undefined, false, true), actorId = actor === "A" ? f.actorA : f.actorB;
    const initialKind = actor === "A" ? "cin" : "paspo", kind = actor === "A" ? "paspo" : "cin";
    await session(page, actorId, "fr", "localhost"); await openKyc(page, initialKind);
    const before = await f.state(), pending = kycResponse(page);
    await kycInput(page, kind).setInputFiles(fictitiousKycFile(actor));
    const response = await pending, body = await response.json();
    expect(response.status()).toBe(200); expect(body).toEqual({ ok: true, id: expect.any(String), kind });
    const intent = await observedKycIntent(page, kind, actor);
    expect(intent).toEqual({ expectedActorId: actorId, cardinality: 1 });
    await expect(kycSection(page).getByRole("listitem")).toHaveText([kycPieceText(initialKind), kycPieceText(kind)]);
    await expect(kycSection(page).locator("img")).toHaveCount(0);
    const saved = await f.state(); assertKycUploaded(before, saved, actorId, kind, body.id);
    const refusals: number[] = [];
    for (const intent of [undefined, "acteur-malforme", { name: "acteur-fictif.txt", mimeType: "text/plain", buffer: Buffer.from(actorId) }]) {
      const current = await f.state();
      const refused = await page.request.post(`${ACCOUNT_ORIGIN}/api/kyc`, { multipart: {
        kind: "selfie", file: fictitiousKycFile(actor), ...(intent === undefined ? {} : { expectedActorId: intent }),
      } });
      refusals.push(refused.status()); expect(refused.status()).toBe(422);
      expect((await refused.json()).error).toBe(t("fr", "api.params.invalid"));
      assertNoKycEffects(current, await f.state());
    }
    console.log(JSON.stringify({ scenario: "comptes fictifs : dépôt KYC autorisé", actor, owner: actorId, intent, uploads: saved.kyc!.uploads, rpcs: saved.kyc!.rpcs, legacyStatuses: refusals }));
  }
});

test("KYC : le refresh LangToggle remonte les pièces B dans le même document", async ({ page, request }) => {
  const f = await fixture(request, false, undefined, false, true);
  await page.setViewportSize({ width: 1280, height: 900 }); await session(page, f.actorA, "fr", "localhost"); await openKyc(page, "cin");
  const beforeRefresh = await f.state(), docB = beforeRefresh.kyc!.documents.find(doc => doc.user_id === f.actorB)!;
  const sentinel = randomUUID(); await page.evaluate(value => { document.documentElement.dataset.kycIdentityDocument = value; }, sentinel);
  await session(page, f.actorB, "fr", "localhost");
  const pendingRsc = page.waitForResponse(response => new URL(response.url()).pathname === "/tableau-de-bord/compte" && response.request().headers().rsc === "1");
  const menu = page.locator("header:visible details").filter({ has: page.getByRole("button", { name: "Français FR", exact: true, includeHidden: true }) });
  await menu.locator("summary").click(); await menu.getByRole("button", { name: "English EN", exact: true }).click();
  const rsc = await pendingRsc; expect(rsc.status()).toBe(200); expect(rsc.headers()["content-type"]).toContain("text/x-component");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("heading", { level: 1, name: t("en", "vendeur.nav.compte"), exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.dataset.kycIdentityDocument)).toBe(sentinel);
  const refreshed = await f.state(), reads = refreshed.kyc!.reads.slice(beforeRefresh.kyc!.reads.length);
  const bRead = reads.find(read => read.owner === f.actorB && read.table === "zabelie_kyc_documents" && read.serviceRole);
  expect(bRead?.select.replace(/\s/g, "")).toBe("id,kind"); expect(bRead?.rows).toEqual([{ id: docB.id, kind: "paspo" }]);
  console.log(JSON.stringify({ scenario: "comptes fictifs : pièces KYC refresh SSR B", rscStatus: rsc.status(), sameDocument: true,
    newReads: reads, serverDocuments: bRead?.rows, browserPieces: await kycSection(page).getByRole("listitem").allTextContents(), uploads: refreshed.kyc!.uploads }));
  await expect(kycSection(page).getByRole("listitem")).toHaveText([kycPieceText("paspo", "en")]);
  const pending = kycResponse(page); await kycInput(page, "selfie", "en").setInputFiles(fictitiousKycFile("B"));
  const response = await pending, body = await response.json();
  expect(response.status()).toBe(200); expect(body).toEqual({ ok: true, id: expect.any(String), kind: "selfie" });
  const intent = await observedKycIntent(page, "selfie", "B");
  expect(intent).toEqual({ expectedActorId: f.actorB, cardinality: 1 });
  await expect(kycSection(page).getByRole("listitem")).toHaveText([kycPieceText("paspo", "en"), kycPieceText("selfie", "en")]);
  const after = await f.state(); assertKycUploaded(refreshed, after, f.actorB, "selfie", body.id);
  console.log(JSON.stringify({ scenario: "comptes fictifs : dépôt KYC après refresh B", intent, uploads: after.kyc!.uploads, rpcs: after.kyc!.rpcs }));
});
