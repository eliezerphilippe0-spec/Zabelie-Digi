import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { t, type Lang } from "../lib/i18n";

// Vrais page/composant/POST ; seuls Auth/PostgREST sont simulés localement.
// Le journal prouve les effets du handler, pas les règles SQL/RLS de production.
const STUB = "http://127.0.0.1:15421";
type Profile = { id: string; display_name: string; bio: string; avatar_url: string | null; country_code: string; region_code: string | null; zone_id: string | null; pwen_repe: string; boutik_slug: string | null };
type ProfileState = { profiles: Profile[]; writes: { id: string; kind: string; patch: Record<string, unknown> }[]; slugReads: { id: string }[] };
const diagnostics = new WeakMap<Page, { errors: string[]; console: { type: string; text: string; url: string }[] }>();
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
  // Chromium reports the deliberately refused stale POST as a console error.
  expect(result.console.filter(message => !(message.type === "error" && message.url.includes("/api/profile") && /\b403\b/.test(message.text)))).toEqual([]);
  await expect(page.locator("nextjs-portal, [data-nextjs-dialog-overlay], [data-nextjs-error-overlay]")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

async function fixture(request: APIRequestContext) {
  const scenario = randomUUID(), actorA = randomUUID(), actorB = randomUUID();
  const initialized = await request.post(`${STUB}/__profile-identity`, { data: { scenario, actorA, actorB } });
  expect(initialized.status()).toBe(200);
  return { actorA, actorB, state: async (): Promise<ProfileState> => (await request.get(`${STUB}/__profile-identity?scenario=${scenario}`)).json() };
}
async function session(page: Page, actorId: string, lang: Lang = "fr") {
  const sessionValue = { access_token: `profile-identity-${actorId}`, refresh_token: "fixture", token_type: "bearer", expires_at: 4102444800, expires_in: 3600,
    user: { id: actorId, aud: "authenticated", role: "authenticated" } };
  await page.context().addCookies([
    { name: "sb-127-auth-token", value: "base64-" + Buffer.from(JSON.stringify(sessionValue)).toString("base64url"), domain: "127.0.0.1", path: "/" },
    { name: "zabelie_lang", value: lang, domain: "127.0.0.1", path: "/" },
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
