import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { t, type Lang } from "../lib/i18n";

// Vrais page, formulaire et handlers. Les E/S PostgREST sont locales : ceci
// n'éprouve ni la RLS, ni les contraintes SQL, ni l'application d'une remise.
const STUB = "http://127.0.0.1:15421";
const PATH = "/tableau-de-bord/codes-promo";
type Coupon = { id: string; seller_id: string; code: string; percent: number; product_id: string | null;
  max_uses: number | null; uses: number; expires_at: string | null; active: boolean; created_at: string };
type Read = { table: string; owner: string; select: string | null; serviceRole: boolean; rows: Record<string, unknown>[] };
type Insert = { tokenActorId: string; input: Record<string, unknown>; row?: Coupon; result?: { code: string; message: string } };
type State = { profiles: { id: string; display_name: string }[]; writes: unknown[]; slugReads: unknown[];
  coupons: { products: { id: string; seller_id: string; title: string }[]; rows: Coupon[]; reads: Read[];
    inserts: Insert[]; updates: { tokenActorId: string; id: string; input: { active: boolean }; affected: number }[]; refusalOnce: boolean } };
const diagnostics = new WeakMap<Page, { errors: string[]; console: { type: string; text: string; url: string }[]; expectedStatuses: Set<number> }>();

test.beforeEach(async ({ page }) => {
  const result = { errors: [] as string[], console: [] as { type: string; text: string; url: string }[], expectedStatuses: new Set<number>() };
  diagnostics.set(page, result);
  page.on("pageerror", error => result.errors.push(error.message));
  page.on("console", message => {
    if (["error", "warning"].includes(message.type())) result.console.push({ type: message.type(), text: message.text(), url: message.location().url });
  });
});
test.afterEach(async ({ page }) => {
  const result = diagnostics.get(page)!;
  const unexpected = result.console.filter(message => {
    const status = message.text.match(/^Failed to load resource: the server responded with a status of (\d+)\b/);
    return !(message.type === "error" && message.url.endsWith("/api/coupons") && status && result.expectedStatuses.has(Number(status[1])));
  });
  const overlayCount = await page.locator("nextjs-portal, [data-nextjs-dialog-overlay], [data-nextjs-error-overlay]").count();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  await test.info().attach("coupon-browser-diagnostics", { body: JSON.stringify({ errors: result.errors, console: result.console,
    expectedStatuses: [...result.expectedStatuses], unexpected, overlayCount, overflow }, null, 2), contentType: "application/json" });
  expect(result.errors).toEqual([]); expect(unexpected).toEqual([]); expect(overlayCount).toBe(0); expect(overflow).toBe(false);
});

async function fixture(request: APIRequestContext, refusalOnce = false) {
  const scenario = randomUUID(), actorA = randomUUID(), actorB = randomUUID();
  const response = await request.post(`${STUB}/__profile-identity`, { data: { scenario, actorA, actorB, coupons: true, couponRefusalOnce: refusalOnce } });
  expect(response.status()).toBe(200);
  return { actorA, actorB, state: async (): Promise<State> => (await request.get(`${STUB}/__profile-identity?scenario=${scenario}`)).json() };
}
async function session(page: Page, actorId: string, lang: Lang = "fr") {
  const value = { access_token: `profile-identity-${actorId}`, refresh_token: "fixture", token_type: "bearer", expires_at: 4102444800, expires_in: 3600,
    user: { id: actorId, aud: "authenticated", role: "authenticated" } };
  await page.context().addCookies([
    { name: "sb-127-auth-token", value: "base64-" + Buffer.from(JSON.stringify(value)).toString("base64url"), domain: "127.0.0.1", path: "/" },
    { name: "zabelie_lang", value: lang, domain: "127.0.0.1", path: "/" },
  ]);
}
// Libellés traduits depuis l'audit du 2026-10-27 (M4) : le français fixe
// attendu ici dans les quatre langues encodait le défaut.
const code = (page: Page, lang: Lang = "fr") => page.getByRole("textbox", { name: t(lang, "vendeur.promo.code"), exact: true });
const percent = (page: Page, lang: Lang = "fr") => page.getByRole("spinbutton", { name: t(lang, "vendeur.promo.remise"), exact: true });
const maxUses = (page: Page, lang: Lang = "fr") => page.getByRole("spinbutton", { name: t(lang, "vendeur.promo.max"), exact: true });
const submit = (page: Page, lang: Lang = "fr") => page.locator("main form").filter({ has: code(page, lang) }).getByRole("button", { name: t(lang, "vendeur.promo.creer"), exact: true });
const couponResponse = (page: Page, method = "POST") => page.waitForResponse(response => new URL(response.url()).pathname === "/api/coupons" && response.request().method() === method);
async function couponPage(page: Page, initialCode: string, lang: Lang = "fr") {
  await page.goto(PATH);
  await expect(page).toHaveURL(/\/tableau-de-bord\/codes-promo$/);
  await expect(page).toHaveTitle("Codes promo — Zabelie");
  await expect(page.getByRole("heading", { level: 1, name: t(lang, "vendeur.nav.promo"), exact: true })).toBeVisible();
  await expect(code(page, lang)).toBeEditable(); await expect(page.getByText(initialCode, { exact: true })).toBeVisible();
  await expect(page.getByText(initialCode === "BASE-A" ? "BASE-B" : "BASE-A", { exact: true })).toHaveCount(0);
}
async function fill(page: Page, value: string, pct: number, maximum = "", lang: Lang = "fr") {
  await code(page, lang).fill(value); await percent(page, lang).fill(String(pct)); await maxUses(page, lang).fill(maximum);
}
function businessState(state: State) {
  return { ...state, coupons: { ...state.coupons, reads: [] } };
}
async function capture(page: Page, name: string) {
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await page.screenshot({ path: test.info().outputPath(name), fullPage: true });
}

for (const lang of ["fr", "ht", "en", "es"] as const) {
  test(`coupons : formulaire A sous cookies B refuse toute création (${lang})`, async ({ page, request }) => {
    const f = await fixture(request);
    await page.setViewportSize({ width: 360, height: 900 }); await session(page, f.actorA, lang);
    await couponPage(page, "BASE-A", lang); await fill(page, "saisie-a", 35, "7", lang);
    const before = await f.state();
    await session(page, f.actorB, lang); diagnostics.get(page)!.expectedStatuses.add(403);
    const pending = couponResponse(page); await submit(page, lang).click(); const response = await pending;
    const body = await response.json(), after = await f.state();
    // Avant correction, cette observation montre le vrai INSERT attribué à B.
    console.log(JSON.stringify({ scenario: "comptes et coupons fictifs : formulaire A sous session B", lang,
      actorA: f.actorA, actorB: f.actorB, status: response.status(), request: response.request().postDataJSON(),
      rowsBefore: before.coupons.rows, rowsAfter: after.coupons.rows, inserts: after.coupons.inserts }));
    expect(response.status()).toBe(403); expect(body.error).toBe(t(lang, "api.auth.required"));
    expect(response.request().postDataJSON()).toEqual({ code: "SAISIE-A", percent: 35, maxUses: 7, expectedActorId: f.actorA });
    expect(businessState(after)).toEqual(businessState(before));
    await expect(page.getByText(t(lang, "api.auth.required"), { exact: true })).toBeVisible();
    await expect(code(page, lang)).toHaveValue("SAISIE-A"); await expect(percent(page, lang)).toHaveValue("35"); await expect(maxUses(page, lang)).toHaveValue("7");
    if (lang === "fr") await capture(page, "coupons-identite-refus-360.png");
  });
}

test("coupons : A et B gardent leurs codes, options et activation propres", async ({ page, request }) => {
  const f = await fixture(request), initial = await f.state();
  await page.setViewportSize({ width: 1280, height: 900 });
  for (const [index, actorId] of [f.actorA, f.actorB].entries()) {
    await session(page, actorId); await couponPage(page, index ? "BASE-B" : "BASE-A");
    const inputCode = index ? " nouveau-b " : " nouveau-a ", expectedCode = inputCode.trim().toUpperCase(), pct = index ? 25 : 35;
    await fill(page, inputCode, pct, index ? "" : "7");
    const pending = couponResponse(page); await submit(page).click(); const response = await pending;
    expect(response.status()).toBe(200); const body = await response.json();
    expect(body).toMatchObject({ ok: true, coupon: { id: expect.any(String), code: expectedCode, percent: pct } });
    expect(response.request().postDataJSON()).toEqual({ code: inputCode.toUpperCase(), percent: pct, maxUses: index ? null : 7, expectedActorId: actorId });
    await expect(code(page)).toHaveValue(""); await expect(maxUses(page)).toHaveValue("");
    await expect(page.getByText(expectedCode, { exact: true })).toBeVisible();
    const saved = await f.state(), insertion = saved.coupons.inserts.at(-1)!;
    expect(insertion).toMatchObject({ tokenActorId: actorId, input: { seller_id: actorId, code: expectedCode, percent: pct,
      product_id: null, max_uses: index ? null : 7, expires_at: null }, row: { id: body.coupon.id, seller_id: actorId,
      code: expectedCode, percent: pct, max_uses: index ? null : 7, uses: 0, active: true, product_id: null, expires_at: null } });
    expect(saved.coupons.rows.filter(row => row.seller_id === actorId)).toHaveLength(2);
    expect(saved.coupons.rows.filter(row => row.id === initial.coupons.rows[1 - index].id)).toEqual([initial.coupons.rows[1 - index]]);
    // Usage nominal du PATCH : la route relit la ligne modifiée (`select=id`)
    // et la doublure rend, comme PostgREST, la ligne affectée.
    const row = page.locator("main li").filter({ has: page.getByText(expectedCode, { exact: true }) });
    const toggled = couponResponse(page, "PATCH"); await row.getByRole("button", { name: t("fr", "vendeur.promo.desactiver"), exact: true }).click();
    const toggle = await toggled; expect(toggle.status()).toBe(200); expect(toggle.request().postDataJSON()).toEqual({ id: body.coupon.id, active: false });
    const reactiver = row.getByRole("button", { name: t("fr", "vendeur.promo.reactiver"), exact: true });
    await expect(reactiver).toBeVisible();
    // Le bouton n'est jamais `disabled` pendant l'attente : il garde le focus.
    await expect(reactiver).toBeFocused();
    const beforeDuplicate = await f.state(); diagnostics.get(page)!.expectedStatuses.add(422);
    await fill(page, expectedCode, pct);
    const duplicated = couponResponse(page); await submit(page).click(); expect((await duplicated).status()).toBe(422);
    await expect(page.getByText(t("fr", "api.coupon.exists"), { exact: true })).toBeVisible();
    const afterDuplicate = await f.state();
    expect(afterDuplicate.coupons.rows).toEqual(beforeDuplicate.coupons.rows);
    expect(afterDuplicate.coupons.inserts).toHaveLength(beforeDuplicate.coupons.inserts.length + 1);
    expect(afterDuplicate.coupons.updates.at(-1)).toEqual({ tokenActorId: actorId, id: body.coupon.id, input: { active: false }, affected: 1 });
    expect(afterDuplicate.profiles).toEqual(initial.profiles); expect(afterDuplicate.writes).toEqual([]); expect(afterDuplicate.slugReads).toEqual([]);
  }
  const logged = businessState(await f.state());
  console.log(JSON.stringify({ scenario: "comptes fictifs : coupons nominaux A et B", state: { ...logged, coupons: { ...logged.coupons,
    products: logged.coupons.products.map(product => ({ id: product.id, seller_id: product.seller_id, title: product.title })) } } }));
  await capture(page, "coupons-identite-nominal-1280.png");
});

test("coupons : refresh RSC B efface saisie et erreur A dans le même document", async ({ page, request }) => {
  const f = await fixture(request, true), initial = await f.state();
  await page.setViewportSize({ width: 1280, height: 900 }); await session(page, f.actorA); await couponPage(page, "BASE-A");
  await fill(page, "ancien-a", 35, "7"); diagnostics.get(page)!.expectedStatuses.add(422);
  const refused = couponResponse(page); await submit(page).click(); expect((await refused).status()).toBe(422);
  // La phrase RÉELLEMENT affichée avant la bascule de compte (français) : c'est
  // elle dont on prouve plus bas la disparition.
  const previousError = t("fr", "api.coupon.exists");
  await expect(page.getByText(previousError, { exact: true })).toBeVisible();
  const before = await f.state(); expect(before.coupons.inserts).toHaveLength(1); expect(before.coupons.rows).toEqual(initial.coupons.rows);
  expect(before.coupons.inserts[0]).toMatchObject({ tokenActorId: f.actorA, input: { seller_id: f.actorA, code: "ANCIEN-A", percent: 35, max_uses: 7 }, result: { code: "23505" } });
  const sentinel = randomUUID(); await page.evaluate(value => { document.documentElement.dataset.couponIdentityDocument = value; }, sentinel);
  await session(page, f.actorB);
  const pendingRsc = page.waitForResponse(response => new URL(response.url()).pathname === PATH && response.request().headers().rsc === "1");
  const menu = page.getByRole("banner").locator("details").filter({ has: page.getByRole("button", { name: "Français FR", exact: true, includeHidden: true }) });
  await expect(menu).toHaveCount(1); await menu.locator("summary").click(); await menu.getByRole("button", { name: "English EN", exact: true }).click();
  const rsc = await pendingRsc; expect(rsc.status()).toBe(200); expect(rsc.headers()["content-type"]).toContain("text/x-component");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("heading", { level: 1, name: t("en", "vendeur.nav.promo"), exact: true })).toBeVisible();
  await expect(page.getByText("BASE-B", { exact: true })).toBeVisible(); await expect(page.getByText("BASE-A", { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.dataset.couponIdentityDocument)).toBe(sentinel);
  const refreshed = await f.state(), newReads = refreshed.coupons.reads.slice(before.coupons.reads.length);
  expect(newReads.some(read => read.table === "profiles" && read.owner === f.actorB && read.rows.some(row => row.display_name === initial.profiles[1].display_name))).toBe(true);
  expect(newReads.some(read => read.table === "products" && read.owner === f.actorB && read.rows.some(row => row.id === initial.coupons.products[1].id))).toBe(true);
  expect(newReads.some(read => read.table === "zabelie_coupons" && read.owner === f.actorB && read.rows.some(row => row.code === "BASE-B"))).toBe(true);
  console.log(JSON.stringify({ scenario: "comptes fictifs : coupons refresh RSC B", rscStatus: rsc.status(), sameDocument: true,
    newReads: newReads.map(read => ({ table: read.table, owner: read.owner, select: read.select, serviceRole: read.serviceRole,
      rows: read.rows.map(row => ({ id: row.id, display_name: row.display_name, code: row.code, seller_id: row.seller_id })) })),
    code: await code(page, "en").inputValue(), percent: await percent(page, "en").inputValue(), maxUses: await maxUses(page, "en").inputValue(),
    previousErrorVisible: await page.getByText(previousError, { exact: true }).isVisible() }));
  expect(businessState(refreshed)).toEqual(businessState(before));
  // Après la bascule en anglais, le formulaire porte les libellés anglais.
  await expect(code(page, "en")).toHaveValue(""); await expect(percent(page, "en")).toHaveValue("10"); await expect(maxUses(page, "en")).toHaveValue("");
  await expect(page.getByText(previousError, { exact: true })).toHaveCount(0);
  await fill(page, "apres-b", 25, "6", "en"); const pending = couponResponse(page); await submit(page, "en").click(); const response = await pending;
  expect(response.status()).toBe(200); expect(response.request().postDataJSON()).toEqual({ code: "APRES-B", percent: 25, maxUses: 6, expectedActorId: f.actorB });
  await expect(page.getByText("APRES-B", { exact: true })).toBeVisible();
  const saved = await f.state(); expect(saved.coupons.inserts).toHaveLength(2); expect(saved.coupons.rows).toHaveLength(3);
  expect(saved.coupons.inserts[1]).toMatchObject({ tokenActorId: f.actorB, input: { seller_id: f.actorB, code: "APRES-B", percent: 25,
    product_id: null, max_uses: 6, expires_at: null }, row: { seller_id: f.actorB, code: "APRES-B", percent: 25, max_uses: 6, uses: 0, active: true } });
  expect(saved.coupons.rows.filter(row => row.seller_id === f.actorA)).toEqual(initial.coupons.rows.filter(row => row.seller_id === f.actorA));
  expect(saved.profiles).toEqual(initial.profiles); expect(saved.writes).toEqual([]); expect(saved.slugReads).toEqual([]); expect(saved.coupons.updates).toEqual([]);
});

test("coupons : un code de 24 caractères sans tiret tient à 360 px, sous son propre bouton", async ({ page, request }) => {
  const f = await fixture(request);
  await page.setViewportSize({ width: 360, height: 900 }); await session(page, f.actorA); await couponPage(page, "BASE-A");
  const long = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  expect(long).toHaveLength(24);
  await fill(page, long, 20);
  const pending = couponResponse(page); await submit(page).click(); expect((await pending).status()).toBe(200);
  const row = page.locator("main li").filter({ has: page.getByText(long, { exact: true }) });
  await expect(row).toBeVisible();
  const bouton = row.getByRole("button", { name: t("fr", "vendeur.promo.desactiver"), exact: true });
  const [boiteCode, boiteBouton, boiteLigne] = await Promise.all([row.getByText(long, { exact: true }).boundingBox(), bouton.boundingBox(), row.boundingBox()]);
  console.log(JSON.stringify({ scenario: "code promo de 24 caractères à 360 px", boiteCode, boiteBouton, boiteLigne }));
  // Le code se coupe AVANT le bouton, et le bouton reste dans la ligne.
  expect(boiteCode!.x + boiteCode!.width).toBeLessThanOrEqual(boiteBouton!.x + 0.5);
  expect(boiteBouton!.x + boiteBouton!.width).toBeLessThanOrEqual(boiteLigne!.x + boiteLigne!.width + 0.5);
  expect(boiteBouton!.height).toBeGreaterThanOrEqual(44);
  const saved = await f.state();
  expect(saved.coupons.inserts.at(-1)).toMatchObject({ tokenActorId: f.actorA, input: { seller_id: f.actorA, code: long, percent: 20 } });
  await capture(page, "coupons-code-long-360.png");
});
