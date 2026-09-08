import { test, expect, type BrowserContext, type APIRequestContext } from "@playwright/test";

const STUB = "http://127.0.0.1:54322";
async function signIn(context: BrowserContext, config: Record<string, unknown> = {}) {
  const response = await context.request.post(`${STUB}/__setup`, { data: config });
  const { cookie } = await response.json();
  await context.addCookies([{ name: "sb-127-auth-token", value: cookie, url: "http://127.0.0.1:3002" }]);
}
async function code(request: APIRequestContext) {
  return (await (await request.get(`${STUB}/__code`)).json()).code as string;
}
async function denied(request: APIRequestContext) {
  expect((await request.get("/api/admin/menu-counts")).status()).toBe(403);
  for (const route of ["refund", "confirm-zelle", "payouts/settle", "product-status", "topup/refunds"]) {
    expect((await request.post(`/api/admin/${route}`, { data: {} })).status(), route).toBe(403);
  }
}

test("anonyme : connexion exigée et API administrateur fermées", async ({ page, request }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/connexion\?next=/);
  await denied(request);
});

test("première activation : code incorrect refusé, puis session MFA persistée", async ({ page, context }) => {
  const request = context.request;
  await signIn(context);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/securite$/);
  await denied(request);
  await page.getByRole("button", { name: "Configurer la double authentification" }).click();
  await expect(page.getByRole("img", { name: /Scanne/ })).toBeVisible();
  await page.getByLabel("Code à six chiffres").fill("000000");
  await page.getByRole("button", { name: "Vérifier et accéder" }).click();
  await expect(page.locator("#mfa-error")).toBeVisible();
  await denied(request);
  await page.getByLabel("Code à six chiffres").fill(await code(request));
  await page.getByRole("button", { name: "Vérifier et accéder" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  expect((await request.get("/api/admin/menu-counts")).status()).toBe(200);
  await page.reload();
  await expect(page).toHaveURL(/\/admin$/);
});

test("compte déjà protégé : challenge requis sans nouvelle clé", async ({ page, context }) => {
  const request = context.request;
  await signIn(context, { verified: true });
  await page.goto("/securite");
  await expect(page.getByLabel("Code à six chiffres")).toBeVisible();
  await expect(page.getByRole("button", { name: "Configurer" })).toHaveCount(0);
  await page.getByLabel("Code à six chiffres").fill(await code(request));
  await page.getByRole("button", { name: "Vérifier et accéder" }).click();
  await expect(page).toHaveURL(/\/admin$/);
});

test("configuration abandonnée : rechargement et reprise possibles", async ({ page, context }) => {
  await signIn(context);
  await page.goto("/securite");
  await page.getByRole("button", { name: "Configurer" }).click();
  await expect(page.getByLabel("Code à six chiffres")).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Configurer" }).click();
  await expect(page.getByLabel("Code à six chiffres")).toBeVisible();
  await expect(page.locator("#mfa-error")).toHaveCount(0);
});

for (const [name, config] of Object.entries({
  "acheteur même avec MFA": { role: "buyer", aal: "aal2", verified: true },
  "JWT falsifié": { aal: "aal2", verified: true, forged: true },
  "facteur supprimé mais cookie ancien": { aal: "aal2", staleFactor: true },
  "service Auth en échec": { aal: "aal2", verified: true, authError: true },
})) {
  test(`refus : ${name}`, async ({ context }) => {
    const request = context.request;
    await signIn(context, config);
    await denied(request);
  });
}

test("les appels refusés n'ont exécuté aucune écriture privilégiée", async ({ request }) => {
  expect((await (await request.get(`${STUB}/__writes`)).json()).writes).toBe(0);
});


test("les actions MFA refusent un non-admin et une origine tierce", async ({ page, context, browser }) => {
  await signIn(context);
  await page.goto("/securite");
  const actionRequest = page.waitForRequest((req) => !!req.headers()["next-action"]);
  await page.getByRole("button", { name: "Configurer" }).click();
  const action = await actionRequest;
  await expect(page.getByLabel("Code à six chiffres")).toBeVisible();
  const outsider = await browser.newContext({ baseURL: "http://127.0.0.1:3002" });
  try {
    await signIn(outsider, { role: "buyer" });
    const headers = { "next-action": action.headers()["next-action"], "content-type": action.headers()["content-type"], origin: "http://127.0.0.1:3002" };
    const rejected = await outsider.request.post("/securite", { headers, data: action.postData()! });
    expect(await rejected.text()).toContain('"error":true');
    const crossSite = await context.request.post("/securite", { headers: { ...headers, origin: "https://example.invalid" }, data: action.postData()! });
    expect(crossSite.status()).toBeGreaterThanOrEqual(400);
  } finally { await outsider.close(); }
});


test("écran MFA mobile lisible dans les quatre langues", async ({ page, context }, testInfo) => {
  await signIn(context, { verified: true });
  await page.setViewportSize({ width: 390, height: 844 });
  for (const [lang, heading] of Object.entries({ fr: "Sécuriser l’administration", ht: "Sekirize administrasyon an", en: "Secure administration", es: "Proteger la administración" })) {
    await context.addCookies([{ name: "zabelie_lang", value: lang, url: "http://127.0.0.1:3002" }]);
    await page.goto("/securite");
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
    await expect(page.locator("#mfa-code")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    if (lang === "fr") await page.screenshot({ path: testInfo.outputPath("mfa-mobile-fr.png"), fullPage: true });
  }
});
