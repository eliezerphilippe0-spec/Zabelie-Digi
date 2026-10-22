import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { t, type Lang } from "../lib/i18n";

// Vrais page/composant/POST ; seuls Auth/PostgREST sont simulés localement.
// Le journal prouve les effets du handler, pas les règles SQL/RLS de production.
const STUB = "http://127.0.0.1:15421";
type Profile = { id: string; display_name: string; bio: string; avatar_url: string | null; country_code: string; region_code: string | null; zone_id: string | null; pwen_repe: string; boutik_slug: string | null };
type ProfileState = { profiles: Profile[]; writes: { id: string; kind: string; patch: Record<string, unknown> }[]; slugReads: { id: string }[];
  zones?: { id: string; parent_id: string | null; level: string }[];
  zoneRequests?: { tokenActorId: string; row: { id: string; requester: string; komin_id: string; nom_propose: string; status: string } }[];
  accountClosure?: ClosureState };
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
      || (expectedAccountRefusals.has(page) && message.url.endsWith("/api/account")))))).toEqual([]);
  await expect(page.locator("nextjs-portal, [data-nextjs-dialog-overlay], [data-nextjs-error-overlay]")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

async function fixture(request: APIRequestContext, withZones = false, accountClosure?: ClosureMode) {
  const scenario = randomUUID(), actorA = randomUUID(), actorB = randomUUID();
  const initialized = await request.post(`${STUB}/__profile-identity`, { data: { scenario, actorA, actorB,
    ...(withZones ? { withZones: true } : {}), ...(accountClosure ? { accountClosure } : {}) } });
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
