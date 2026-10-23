import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { t, type Lang } from "../lib/i18n";

/**
 * Pixels vendeur (0123) : RIEN ne part vers une régie avant le consentement ;
 * un refus est retenu ; un accord charge les seules régies configurées.
 * Les régies sont interceptées (aucune requête ne sort du test).
 */
async function intercepter(page: Page) {
  const appels: string[] = [];
  await page.route(/connect\.facebook\.net|googletagmanager\.com|analytics\.tiktok\.com|google-analytics\.com|facebook\.com\/tr/, (route) => {
    appels.push(route.request().url());
    return route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
  });
  return appels;
}

test("aucun pixel avant consentement ; le refus est retenu", async ({ page }) => {
  const appels = await intercepter(page);
  const r = await page.goto("/produit/pixel-test", { waitUntil: "networkidle" });
  expect(r?.headers()["content-security-policy"]).toContain("https://connect.facebook.net");
  const bandeau = page.locator("[data-bandeau-pixels]");
  await expect(bandeau).toBeVisible();
  expect(appels).toEqual([]);

  await bandeau.getByRole("button").first().click(); // Refuser
  await expect(bandeau).toHaveCount(0);
  expect((await page.context().cookies()).find((c) => c.name === "zab_pub")?.value).toBe("0");
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.locator("[data-bandeau-pixels]")).toHaveCount(0);
  expect(appels, "un refus ne charge rien, même après rechargement").toEqual([]);
});

test("l'accord charge Meta et Google (configurés), pas TikTok ; ViewContent part avec le prix", async ({ page }) => {
  const appels = await intercepter(page);
  await page.goto("/produit/pixel-test", { waitUntil: "networkidle" });
  await page.locator("[data-bandeau-pixels]").getByRole("button").last().click(); // Accepter
  await expect.poll(() => appels.length).toBeGreaterThanOrEqual(2);
  expect(appels.some((u) => u.includes("connect.facebook.net/en_US/fbevents.js"))).toBe(true);
  expect(appels.some((u) => u.includes("googletagmanager.com/gtag/js?id=G-AB12CD34EF"))).toBe(true);
  expect(appels.some((u) => u.includes("tiktok"))).toBe(false);
  const evenements = await page.evaluate(() => ((window as unknown as { fbq: { queue: unknown[][] } }).fbq.queue).map((a) => a[1]));
  expect(evenements).toEqual(["123456789012345", "PageView", "ViewContent"]);
});

test("hors des pages vendeur : ni bandeau, ni domaines de régie dans la CSP", async ({ page }) => {
  const r = await page.goto("/catalogue", { waitUntil: "networkidle" });
  expect(r?.headers()["content-security-policy"]).not.toContain("facebook");
  await expect(page.locator("[data-bandeau-pixels]")).toHaveCount(0);
  const p = await page.goto("/produit/" + "kit-depart", { waitUntil: "networkidle" });
  expect(p?.status()).toBeLessThan(500);
  await expect(page.locator("[data-bandeau-pixels]"), "un vendeur sans pixel n'affiche aucun bandeau").toHaveCount(0);
});

test("« Gérer les traceurs » : depuis le pied de page, l'accord se retire en un clic et efface les cookies des régies", async ({ page, context, baseURL }) => {
  const url = baseURL!;
  await context.addCookies([
    { name: "zab_pub", value: "1", url },
    { name: "_fbp", value: "fb.1.test", url },
  ]);
  await page.goto("/catalogue");
  await page.locator('footer a[href="/confidentialite#traceurs"]').click();
  await expect(page).toHaveURL(/\/confidentialite#traceurs$/);
  const centre = page.locator("[data-preferences-traceurs]");
  await expect(centre.locator("[data-etat]")).toHaveAttribute("data-etat", "oui");
  await centre.getByRole("button").first().click(); // Refuser
  await expect(centre.locator("[data-etat]")).toHaveAttribute("data-etat", "non");
  const cookies = await context.cookies();
  expect(cookies.find((c) => c.name === "zab_pub")?.value).toBe("0");
  expect(cookies.find((c) => c.name === "_fbp"), "le refus efface l'identifiant Meta déjà posé").toBeUndefined();

  const appels = await intercepter(page);
  await page.goto("/produit/pixel-test", { waitUntil: "networkidle" });
  await expect(page.locator("[data-bandeau-pixels]")).toHaveCount(0);
  expect(appels).toEqual([]);
});

test("relances : la page de désabonnement ne coupe rien seule, et parle kreyòl", async ({ page, context, baseURL }) => {
  await context.addCookies([{ name: "zabelie_lang", value: "ht", url: baseURL! }]);
  const jeton = "0b6b4c1e-8a4e-4d0b-9f43-2a1c3d4e5f60";
  await page.goto(`/desabonnement/${jeton}`);
  const form = page.locator('main form[action="/api/desabonnement"]');
  await expect(form).toHaveAttribute("method", "post");
  await expect(form.locator('input[name="jeton"]')).toHaveValue(jeton);
  await expect(form.getByRole("button")).toHaveText("Kanpe rapèl yo");
  const get = await page.request.get(`/api/desabonnement?jeton=${jeton}`);
  expect(get.status(), "un GET (scanner de liens) ne désabonne pas").toBe(405);
});

type PixelValues = { meta: string; google: string; tiktok: string };
type PixelRow = { seller_id: string; meta_pixel_id: string | null; google_tag_id: string | null; tiktok_pixel_id: string | null; updated_at?: string };
type PixelRead = { table: string; owner: string; select: string | null; serviceRole: boolean; rows: Record<string, unknown>[] };
type PixelState = { profiles: { id: string; display_name: string }[]; writes: unknown[]; slugReads: unknown[];
  pixels: { rows: PixelRow[]; reads: PixelRead[]; upserts: { tokenActorId: string; input: PixelRow; before: PixelRow | null; row: PixelRow }[] } };
const PIXEL_SETTINGS = "/tableau-de-bord/api";
const PIXEL_STUB = "http://127.0.0.1:15421";
const pixelDiagnostics = new WeakMap<Page, { errors: string[]; console: { type: string; text: string; url: string }[]; expectedStatuses: Set<number> }>();

async function pixelFixture(request: APIRequestContext) {
  const scenario = randomUUID(), actorA = randomUUID(), actorB = randomUUID();
  const response = await request.post(`${PIXEL_STUB}/__profile-identity`, { data: { scenario, actorA, actorB, pixels: true } });
  expect(response.status()).toBe(200);
  return { actorA, actorB, state: async (): Promise<PixelState> => (await request.get(`${PIXEL_STUB}/__profile-identity?scenario=${scenario}`)).json() };
}
async function pixelSession(page: Page, actorId: string, lang: Lang = "fr") {
  const value = { access_token: `profile-identity-${actorId}`, refresh_token: "fixture", token_type: "bearer", expires_at: 4102444800,
    expires_in: 3600, user: { id: actorId, aud: "authenticated", role: "authenticated" } };
  await page.context().addCookies([
    { name: "sb-127-auth-token", value: "base64-" + Buffer.from(JSON.stringify(value)).toString("base64url"), domain: "127.0.0.1", path: "/" },
    { name: "zabelie_lang", value: lang, domain: "127.0.0.1", path: "/" },
  ]);
}
const pixelInput = (page: Page, field: keyof PixelValues, lang: Lang = "fr") => page.getByRole("textbox", { name: t(lang, `pixels.${field}`) });
const pixelForm = (page: Page, lang: Lang = "fr") => page.locator("main form").filter({ has: pixelInput(page, "meta", lang) });
const pixelSubmit = (page: Page, lang: Lang = "fr") => pixelForm(page, lang).getByRole("button", { name: t(lang, "pixels.save"), exact: true });
const pixelResponse = (page: Page) => page.waitForResponse(response => new URL(response.url()).pathname === "/api/account/pixels" && response.request().method() === "PUT");
const pixelValues = (row: PixelRow): PixelValues => ({ meta: row.meta_pixel_id ?? "", google: row.google_tag_id ?? "", tiktok: row.tiktok_pixel_id ?? "" });
const pixelBusinessState = (state: PixelState) => ({ ...state, pixels: { ...state.pixels, reads: [] } });
async function pixelFill(page: Page, values: PixelValues, lang: Lang = "fr") {
  for (const field of ["meta", "google", "tiktok"] as const) await pixelInput(page, field, lang).fill(values[field]);
}
async function pixelExpectValues(page: Page, values: PixelValues, lang: Lang = "fr") {
  for (const field of ["meta", "google", "tiktok"] as const) await expect(pixelInput(page, field, lang)).toHaveValue(values[field]);
}
async function pixelPage(page: Page, values: PixelValues, lang: Lang = "fr") {
  await page.goto(PIXEL_SETTINGS);
  await expect(page).toHaveURL(/\/tableau-de-bord\/api$/);
  await expect(page.getByRole("heading", { level: 1, name: t(lang, "apikeys.title"), exact: true })).toBeVisible();
  await pixelExpectValues(page, values, lang);
}
async function pixelCapture(page: Page, name: string, lang: Lang = "fr") {
  await expect(pixelForm(page, lang)).toBeVisible();
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await page.screenshot({ path: test.info().outputPath(name), fullPage: true });
}

test.describe("pixels identité", () => {
  test.beforeEach(async ({ page }) => {
    const result = { errors: [] as string[], console: [] as { type: string; text: string; url: string }[], expectedStatuses: new Set<number>() };
    pixelDiagnostics.set(page, result);
    page.on("pageerror", error => result.errors.push(error.message));
    page.on("console", message => {
      if (["error", "warning"].includes(message.type())) result.console.push({ type: message.type(), text: message.text(), url: message.location().url });
    });
  });
  test.afterEach(async ({ page }) => {
    const result = pixelDiagnostics.get(page)!;
    const unexpected = result.console.filter(message => {
      const status = message.text.match(/^Failed to load resource: the server responded with a status of (\d+)\b/);
      return !(message.type === "error" && message.url.endsWith("/api/account/pixels") && status && result.expectedStatuses.has(Number(status[1])));
    });
    const overlayCount = await page.locator("nextjs-portal, [data-nextjs-dialog-overlay], [data-nextjs-error-overlay]").count();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    await test.info().attach("pixels-browser-diagnostics", { body: JSON.stringify({ ...result, expectedStatuses: [...result.expectedStatuses],
      unexpected, overlayCount, overflow }, null, 2), contentType: "application/json" });
    expect(result.errors).toEqual([]); expect(unexpected).toEqual([]); expect(overlayCount).toBe(0); expect(overflow).toBe(false);
  });

  for (const lang of ["fr", "ht", "en", "es"] as const) {
    test(`formulaire A sous cookies B refuse tout remplacement (${lang})`, async ({ page, request }) => {
      const f = await pixelFixture(request), initial = await f.state();
      await page.setViewportSize({ width: 360, height: 900 }); await pixelSession(page, f.actorA, lang);
      await pixelPage(page, pixelValues(initial.pixels.rows[0]), lang);
      const input = { meta: "323456789012345", google: "g-a987654321", tiktok: "c6abcdef0123456789ab" };
      await pixelFill(page, input, lang); const before = await f.state();
      await pixelSession(page, f.actorB, lang); pixelDiagnostics.get(page)!.expectedStatuses.add(403);
      const pending = pixelResponse(page); await pixelSubmit(page, lang).click(); const response = await pending;
      const body = await response.json(), after = await f.state();
      console.log(JSON.stringify({ scenario: "pixels fictifs : formulaire A sous session B", lang, actorA: f.actorA, actorB: f.actorB,
        status: response.status(), request: response.request().postDataJSON(), rowsBefore: before.pixels.rows,
        rowsAfter: after.pixels.rows, upserts: after.pixels.upserts }));
      await test.info().attach("pixels-identity-observation", { body: JSON.stringify({ status: response.status(), body,
        before: pixelBusinessState(before), after: pixelBusinessState(after) }, null, 2), contentType: "application/json" });
      if (lang === "fr") await pixelCapture(page, "pixels-identite-session-360.png", lang);
      expect(response.status()).toBe(403); expect(body.error).toBe(t(lang, "api.auth.required"));
      expect(response.request().postDataJSON()).toEqual({ ...input, expectedActorId: f.actorA });
      expect(pixelBusinessState(after)).toEqual(pixelBusinessState(before));
      await expect(pixelForm(page, lang).getByRole("alert")).toHaveText(t(lang, "api.auth.required"));
      await pixelExpectValues(page, input, lang);
    });
  }

  test("A et B conservent leurs pixels propres, normalisation et retrait compris", async ({ page, request }) => {
    const f = await pixelFixture(request), initial = await f.state();
    await page.setViewportSize({ width: 1280, height: 900 });
    for (const [index, actorId] of [f.actorA, f.actorB].entries()) {
      await pixelSession(page, actorId); await pixelPage(page, pixelValues(initial.pixels.rows[index]));
      const input = { meta: index ? " 423456789012345 " : " 323456789012345 ",
        google: index ? " g-b987654321 " : " g-a987654321 ", tiktok: index ? " " : " c6abcdef0123456789ab " };
      const expected = { meta: input.meta.trim(), google: input.google.trim().toUpperCase(), tiktok: input.tiktok.trim().toUpperCase() };
      const before = await f.state(); await pixelFill(page, input);
      const pending = pixelResponse(page); await pixelSubmit(page).click(); const response = await pending;
      expect(response.status()).toBe(200); expect(await response.json()).toEqual({ ok: true, meta: expected.meta,
        google: expected.google, tiktok: expected.tiktok || null });
      expect(response.request().postDataJSON()).toEqual({ ...input, expectedActorId: actorId });
      await pixelExpectValues(page, expected); await expect(pixelForm(page).getByRole("status")).toHaveText(t("fr", "pixels.saved"));
      const after = await f.state(), saved = after.pixels.upserts.at(-1)!;
      expect(saved).toMatchObject({ tokenActorId: actorId, input: { seller_id: actorId, meta_pixel_id: expected.meta,
        google_tag_id: expected.google, tiktok_pixel_id: expected.tiktok || null }, before: before.pixels.rows[index] });
      expect(typeof saved.input.updated_at).toBe("string"); expect(Number.isFinite(Date.parse(saved.input.updated_at!))).toBe(true);
      expect(pixelValues(after.pixels.rows[index])).toEqual(expected);
      expect(after.pixels.rows[1 - index]).toEqual(before.pixels.rows[1 - index]);
      expect(after.profiles).toEqual(initial.profiles); expect(after.writes).toEqual([]);
      expect(after.pixels.upserts).toHaveLength(index + 1);
    }
    console.log(JSON.stringify({ scenario: "pixels fictifs : enregistrements nominaux A et B", state: pixelBusinessState(await f.state()) }));
    await pixelCapture(page, "pixels-identite-nominal-1280.png");
  });

  test("refresh RSC B remplace les valeurs et efface l'erreur A dans le même document", async ({ page, request }) => {
    const f = await pixelFixture(request), initial = await f.state();
    await page.setViewportSize({ width: 1280, height: 900 }); await pixelSession(page, f.actorA);
    await pixelPage(page, pixelValues(initial.pixels.rows[0]));
    const input = { meta: "invalide-a", google: "g-a987654321", tiktok: "c6abcdef0123456789ab" };
    await pixelFill(page, input); pixelDiagnostics.get(page)!.expectedStatuses.add(422);
    const pending = pixelResponse(page); await pixelSubmit(page).click(); expect((await pending).status()).toBe(422);
    const previousError = t("fr", "pixels.err.format"); await expect(pixelForm(page).getByRole("alert")).toHaveText(previousError);
    const before = await f.state(); expect(before.pixels.upserts).toEqual([]); expect(before.pixels.rows).toEqual(initial.pixels.rows);
    const sentinel = randomUUID(); await page.evaluate(value => { document.documentElement.dataset.pixelIdentityDocument = value; }, sentinel);
    await pixelSession(page, f.actorB);
    const pendingRsc = page.waitForResponse(response => new URL(response.url()).pathname === PIXEL_SETTINGS && response.request().headers().rsc === "1");
    const language = page.getByRole("banner").locator("details").filter({ has: page.getByRole("button", { name: "Français FR", exact: true, includeHidden: true }) });
    await expect(language).toHaveCount(1); await language.locator("summary").click(); await language.getByRole("button", { name: "English EN", exact: true }).click();
    const rsc = await pendingRsc; expect(rsc.status()).toBe(200); expect(rsc.headers()["content-type"]).toContain("text/x-component");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("heading", { level: 1, name: t("en", "apikeys.title"), exact: true })).toBeVisible();
    const sameDocument = await page.evaluate(() => document.documentElement.dataset.pixelIdentityDocument === undefined ? null : document.documentElement.dataset.pixelIdentityDocument);
    expect(sameDocument).toBe(sentinel);
    const after = await f.state(), newReads = after.pixels.reads.slice(before.pixels.reads.length);
    expect(newReads.some(read => read.table === "profiles" && read.owner === f.actorB && read.rows.some(row => row.display_name === initial.profiles[1].display_name))).toBe(true);
    expect(newReads.some(read => read.table === "zabelie_seller_pixels" && read.owner === f.actorB
      && read.rows.some(row => row.meta_pixel_id === initial.pixels.rows[1].meta_pixel_id && row.google_tag_id === initial.pixels.rows[1].google_tag_id))).toBe(true);
    const observed = { meta: await pixelInput(page, "meta", "en").inputValue(), google: await pixelInput(page, "google", "en").inputValue(),
      tiktok: await pixelInput(page, "tiktok", "en").inputValue() };
    const observation = { scenario: "pixels fictifs : refresh RSC B", rscStatus: rsc.status(), sameDocument: sameDocument === sentinel,
      newReads, observed, expected: pixelValues(initial.pixels.rows[1]), previousErrorVisible: await page.getByText(previousError, { exact: true }).isVisible() };
    console.log(JSON.stringify(observation)); await test.info().attach("pixels-rsc-observation", { body: JSON.stringify(observation, null, 2), contentType: "application/json" });
    await pixelCapture(page, "pixels-identite-rsc-1280.png", "en");
    expect(pixelBusinessState(after)).toEqual(pixelBusinessState(before));
    await pixelExpectValues(page, pixelValues(initial.pixels.rows[1]), "en");
    await expect(pixelForm(page, "en").getByRole("alert")).toHaveCount(0); await expect(pixelForm(page, "en").getByRole("status")).toHaveCount(0);
    const nextValues = { meta: " 423456789012345 ", google: " g-b987654321 ", tiktok: " " };
    await pixelFill(page, nextValues, "en"); const savedPending = pixelResponse(page); await pixelSubmit(page, "en").click();
    const savedResponse = await savedPending; expect(savedResponse.status()).toBe(200);
    expect(savedResponse.request().postDataJSON()).toEqual({ ...nextValues, expectedActorId: f.actorB });
    const final = await f.state(); expect(final.pixels.upserts).toHaveLength(1);
    expect(final.pixels.upserts[0]).toMatchObject({ tokenActorId: f.actorB, input: { seller_id: f.actorB, meta_pixel_id: "423456789012345",
      google_tag_id: "G-B987654321", tiktok_pixel_id: null } });
    expect(final.pixels.rows[0]).toEqual(initial.pixels.rows[0]);
  });
});
