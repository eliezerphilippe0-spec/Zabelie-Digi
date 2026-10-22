import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { t, type Lang } from "../lib/i18n";

// Vrais tableau de bord, formulaire et POST. Le RPC est une E/S locale fixe ;
// les soldes synthétiques ne prouvent ni le SQL, ni un virement, ni sa RLS.
const STUB = "http://127.0.0.1:15421";
type Wallet = { id: string; owner_id: string; balance_htg: number; pending_htg: number };
type Payout = { id: string; wallet_id: string; amount_htg: number; status: string };
type Rpc = { name: string; args: { p_user_id: string; p_amount_htg: number }; serviceRole: boolean;
  result: { ok: boolean; payout_id?: string; balance_htg?: number; reason?: string } };
type Read = { table: string; owner: string | null; wallet_id?: string | null; select: string | null; rows: Record<string, unknown>[] };
type State = { profiles: { id: string; display_name: string }[]; writes: unknown[]; slugReads: unknown[];
  payouts: { wallets: Wallet[]; requests: Payout[]; rpcs: Rpc[]; reads: Read[]; refusalOnce: boolean } };
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
    return !(message.type === "error" && message.url.endsWith("/api/payouts") && status && result.expectedStatuses.has(Number(status[1])));
  });
  const overlayCount = await page.locator("nextjs-portal, [data-nextjs-dialog-overlay], [data-nextjs-error-overlay]").count();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  await test.info().attach("payout-browser-diagnostics", { body: JSON.stringify({ errors: result.errors, console: result.console,
    expectedStatuses: [...result.expectedStatuses], unexpected, overlayCount, overflow }, null, 2), contentType: "application/json" });
  expect(result.errors).toEqual([]);
  expect(unexpected).toEqual([]);
  expect(overlayCount).toBe(0);
  expect(overflow).toBe(false);
});

async function fixture(request: APIRequestContext, refusalOnce = false) {
  const scenario = randomUUID(), actorA = randomUUID(), actorB = randomUUID();
  const response = await request.post(`${STUB}/__profile-identity`, { data: { scenario, actorA, actorB, payouts: true, payoutRefusalOnce: refusalOnce } });
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
const amount = (page: Page, lang: Lang = "fr") => page.getByRole("spinbutton", { name: t(lang, "vendeur.retrait.montant"), exact: true });
const submit = (page: Page, lang: Lang = "fr") => page.getByRole("button", { name: t(lang, "vendeur.retrait.envoyer"), exact: true });
const payoutResponse = (page: Page) => page.waitForResponse(response => new URL(response.url()).pathname === "/api/payouts" && response.request().method() === "POST");
async function dashboard(page: Page, displayName: string, lang: Lang = "fr") {
  await page.goto("/tableau-de-bord");
  await expect(page).toHaveURL(/\/tableau-de-bord$/);
  await expect(page).toHaveTitle("Tableau de bord — Zabelie");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(displayName);
  await expect(page.getByRole("button", { name: t(lang, "vendeur.retrait.ouvrir"), exact: true })).toBeEnabled();
}
async function openPayout(page: Page, lang: Lang = "fr") {
  await page.getByRole("button", { name: t(lang, "vendeur.retrait.ouvrir"), exact: true }).click();
  await expect(amount(page, lang)).toBeVisible();
}
function businessState(state: State) {
  // Seules les lectures SSR sont diagnostiques ; tous les autres champs,
  // y compris profils/slugReads/écritures/RPC, restent comparés intégralement.
  return { ...state, payouts: { ...state.payouts, reads: [] } };
}
async function capture(page: Page, name: string) {
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await page.screenshot({ path: test.info().outputPath(name), fullPage: true });
}

for (const lang of ["fr", "ht", "en", "es"] as const) {
  test(`retrait : formulaire A sous cookies B refuse tout RPC (${lang})`, async ({ page, request }) => {
    const f = await fixture(request), initial = await f.state();
    await page.setViewportSize({ width: 360, height: 900 }); await session(page, f.actorA, lang);
    await dashboard(page, initial.profiles[0].display_name, lang); await openPayout(page, lang);
    await amount(page, lang).fill("500");
    const before = await f.state();
    await session(page, f.actorB, lang); diagnostics.get(page)!.expectedStatuses.add(403);
    const pending = payoutResponse(page); await submit(page, lang).click();
    const response = await pending, body = await response.json(), after = await f.state();
    // L'observation précède le refus attendu : sur l'ancien code, le vrai
    // handler appelle le RPC avec B et le solde fictif montre son débit.
    console.log(JSON.stringify({ scenario: "comptes et soldes fictifs : retrait A sous session B", lang,
      actorA: f.actorA, actorB: f.actorB, status: response.status(), request: response.request().postDataJSON(),
      walletsBefore: before.payouts.wallets, walletsAfter: after.payouts.wallets, requests: after.payouts.requests, rpcs: after.payouts.rpcs }));
    expect(response.status()).toBe(403);
    expect(body.error).toBe(t(lang, "api.auth.required"));
    expect(response.request().postDataJSON()).toEqual({ amountHtg: 500, expectedActorId: f.actorA });
    expect(businessState(after)).toEqual(businessState(before));
    await expect(page.getByText(t(lang, "api.auth.required"), { exact: true })).toBeVisible();
    await expect(amount(page, lang)).toHaveValue("500");
    if (lang === "fr") await capture(page, "retrait-identite-refus-360.png");
  });
}

test("retrait : les formulaires A et B gardent leur demande et solde propres", async ({ page, request }) => {
  const f = await fixture(request), initial = await f.state();
  await page.setViewportSize({ width: 1280, height: 900 });
  for (const [index, actorId] of [f.actorA, f.actorB].entries()) {
    const requested = index ? 750 : 500;
    await session(page, actorId); await dashboard(page, initial.profiles[index].display_name); await openPayout(page);
    await amount(page).fill(String(requested));
    const pending = payoutResponse(page); await submit(page).click(); const response = await pending;
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ ok: true, payoutId: expect.any(String), balanceHtg: initial.payouts.wallets[index].balance_htg - requested, fraisIaReglesHtg: 0 });
    expect(response.request().postDataJSON()).toEqual({ amountHtg: requested, expectedActorId: actorId });
    await expect(page.getByText(t("fr", "vendeur.retrait.enCours"), { exact: true })).toBeVisible();
    const saved = await f.state();
    expect(saved.payouts.rpcs).toHaveLength(index + 1); expect(saved.payouts.requests).toHaveLength(index + 1);
    expect(saved.payouts.rpcs[index]).toMatchObject({ name: "zabelie_request_payout", serviceRole: true,
      args: { p_user_id: actorId, p_amount_htg: requested }, result: { ok: true, payout_id: body.payoutId } });
    expect(saved.payouts.requests[index]).toEqual({ id: body.payoutId, wallet_id: initial.payouts.wallets[index].id, amount_htg: requested, status: "requested" });
    expect(saved.payouts.wallets).toEqual(initial.payouts.wallets.map((wallet, walletIndex) => ({ ...wallet,
      balance_htg: wallet.balance_htg - (walletIndex <= index ? (walletIndex ? 750 : 500) : 0) })));
    expect(saved.profiles).toEqual(initial.profiles); expect(saved.writes).toEqual([]); expect(saved.slugReads).toEqual([]);
  }
  console.log(JSON.stringify({ scenario: "comptes et soldes fictifs : retraits nominaux A et B", state: businessState(await f.state()) }));
  await capture(page, "retrait-identite-succes-1280.png");
});

test("retrait : le refresh RSC B efface montant et erreur A dans le même document", async ({ page, request }) => {
  const f = await fixture(request, true), initial = await f.state();
  await page.setViewportSize({ width: 1280, height: 900 }); await session(page, f.actorA);
  await dashboard(page, initial.profiles[0].display_name); await openPayout(page); await amount(page).fill("100");
  diagnostics.get(page)!.expectedStatuses.add(422);
  const refused = payoutResponse(page); await submit(page).click(); expect((await refused).status()).toBe(422);
  const previousError = "Le minimum est de 500 HTG.";
  await expect(page.getByText(previousError, { exact: true })).toBeVisible();
  const before = await f.state();
  expect(before.payouts.rpcs).toHaveLength(1);
  expect(before.payouts.rpcs[0]).toMatchObject({ args: { p_user_id: f.actorA, p_amount_htg: 100 }, result: { ok: false, reason: "sous_minimum" } });
  expect(before.payouts.wallets).toEqual(initial.payouts.wallets); expect(before.payouts.requests).toEqual([]);
  const sentinel = randomUUID(); await page.evaluate(value => { document.documentElement.dataset.payoutIdentityDocument = value; }, sentinel);
  await session(page, f.actorB);
  const pendingRsc = page.waitForResponse(response => new URL(response.url()).pathname === "/tableau-de-bord" && response.request().headers().rsc === "1");
  const menu = page.getByRole("banner").locator("details").filter({ has: page.getByRole("button", { name: "Français FR", exact: true, includeHidden: true }) });
  await expect(menu).toHaveCount(1); await menu.locator("summary").click(); await menu.getByRole("button", { name: "English EN", exact: true }).click();
  const rsc = await pendingRsc;
  expect(rsc.status()).toBe(200); expect(rsc.headers()["content-type"]).toContain("text/x-component");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(initial.profiles[1].display_name);
  expect(await page.evaluate(() => document.documentElement.dataset.payoutIdentityDocument)).toBe(sentinel);
  const refreshed = await f.state(), newReads = refreshed.payouts.reads.slice(before.payouts.reads.length);
  expect(newReads.some(read => read.table === "profiles" && read.owner === f.actorB && read.rows.some(row => row.display_name === initial.profiles[1].display_name))).toBe(true);
  expect(newReads.some(read => read.table === "wallets" && read.owner === f.actorB && read.rows.some(row => row.balance_htg === initial.payouts.wallets[1].balance_htg))).toBe(true);
  console.log(JSON.stringify({ scenario: "comptes fictifs : retrait refresh RSC B", rscStatus: rsc.status(), sameDocument: true, newReads,
    previousErrorVisible: await page.getByText(previousError, { exact: true }).isVisible(),
    amountStillMounted: await amount(page, "en").count(), oldAmount: await amount(page, "en").count() ? await amount(page, "en").inputValue() : null }));
  expect(businessState(refreshed)).toEqual(businessState(before));
  await expect(amount(page, "en")).toHaveCount(0);
  await expect(page.getByText(previousError, { exact: true })).toHaveCount(0);
  await openPayout(page, "en"); await expect(amount(page, "en")).toHaveValue("");
  await amount(page, "en").fill("750");
  const pending = payoutResponse(page); await submit(page, "en").click(); const response = await pending;
  expect(response.status()).toBe(200);
  expect(response.request().postDataJSON()).toEqual({ amountHtg: 750, expectedActorId: f.actorB });
  await expect(page.getByText(t("en", "vendeur.retrait.enCours"), { exact: true })).toBeVisible();
  const saved = await f.state();
  expect(saved.payouts.rpcs).toHaveLength(2); expect(saved.payouts.requests).toHaveLength(1);
  expect(saved.payouts.rpcs[1]).toMatchObject({ serviceRole: true, args: { p_user_id: f.actorB, p_amount_htg: 750 }, result: { ok: true } });
  expect(saved.payouts.requests[0]).toMatchObject({ wallet_id: initial.payouts.wallets[1].id, amount_htg: 750, status: "requested" });
  expect(saved.payouts.wallets).toEqual(initial.payouts.wallets.map(wallet => ({ ...wallet, balance_htg: wallet.balance_htg - (wallet.owner_id === f.actorB ? 750 : 0) })));
  expect(saved.profiles).toEqual(initial.profiles); expect(saved.writes).toEqual([]); expect(saved.slugReads).toEqual([]);
});
