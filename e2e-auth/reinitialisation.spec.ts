import { test as base, expect, type BrowserContext, type Page, type Request as BrowserRequest } from "@playwright/test";
import { t, type Lang } from "../lib/i18n";

// Les erreurs JavaScript sont distinctes des refus HTTP Auth attendus.
// La collecte appartient au contexte du test, y compris son second onglet.
const test = base.extend<{ erreursPage: void }>({
  erreursPage: [async ({ context, page }, use) => {
    const erreurs: string[] = [];
    const observees = new Set<Page>();
    const surveiller = (onglet: Page) => {
      if (observees.has(onglet)) return;
      observees.add(onglet);
      onglet.on("pageerror", erreur => erreurs.push(erreur.message));
    };
    surveiller(page);
    context.on("page", surveiller);
    await use();
    expect(erreurs, "aucune erreur JavaScript non interceptée pendant le parcours").toEqual([]);
  }, { auto: true }],
});

const AUTH = "http://127.0.0.1:15423/auth/v1/";
const ORIGIN = "http://127.0.0.1:3003";
const RESET = "/reinitialiser-mot-de-passe";
const A = "00000000-0000-0000-0000-00000000a001";
const B = "00000000-0000-0000-0000-00000000b002";
const PASSWORD = "Nouveau-test-456!";

function observer(page: Page) {
  const updates: BrowserRequest[] = [];
  const exchanges: BrowserRequest[] = [];
  page.on("request", request => {
    if (request.url().startsWith(AUTH + "user") && request.method() === "PUT") updates.push(request);
    if (request.url().startsWith(AUTH + "token?grant_type=pkce") && request.method() === "POST") exchanges.push(request);
  });
  return { updates, exchanges };
}

function acteur(request: BrowserRequest): string {
  const token = request.headers().authorization?.replace(/^Bearer /, "");
  expect(token, "la requête Auth porte son jeton de session factice").toBeTruthy();
  return JSON.parse(Buffer.from(token!.split(".")[1], "base64url").toString()).sub;
}

async function connecter(page: Page, compte: "a" | "b") {
  await page.goto("/connexion?next=%2Fmes-achats");
  await page.locator("#auth-email").fill(compte === "a" ? "buyer@example.test" : "other@example.test");
  await page.locator("#auth-password").fill("Valid-test-123!");
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/mes-achats$/);
}

/** Le vrai SDK crée le vérificateur dans les cookies, jamais le test. */
async function demanderLien(page: Page, context: BrowserContext, expire = false) {
  await page.goto("/mot-de-passe-oublie");
  await page.getByRole("textbox", { name: t("fr", "auth.email.ph"), exact: true }).fill("buyer@example.test");
  const envoi = page.waitForRequest(request => request.url().startsWith(AUTH + "recover") && request.method() === "POST");
  await page.getByRole("button", { name: t("fr", "forgot.submit"), exact: true }).click();
  const request = await envoi;
  await expect(page.getByText(t("fr", "forgot.success"), { exact: true })).toBeVisible();
  const body = request.postDataJSON();
  expect(body.code_challenge_method).toBe("s256");
  expect(body.code_challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect((await context.cookies()).some(cookie => /^sb-127-auth-token.*-code-verifier(?:\.\d+)?$/.test(cookie.name))).toBe(true);
  const destination = new URL(new URL(request.url()).searchParams.get("redirect_to")!);
  expect(destination.origin).toBe(ORIGIN);
  expect(destination.pathname).toBe(RESET);
  destination.searchParams.set("code", `${expire ? "expired" : "recovery"}-a.${body.code_challenge}`);
  return destination.pathname + destination.search;
}

async function fragment(context: BrowserContext) {
  const response = await context.request.get("http://127.0.0.1:15423/__session?account=a");
  expect(response.ok()).toBe(true);
  const session = await response.json();
  return RESET + "#" + new URLSearchParams({
    access_token: session.access_token, refresh_token: session.refresh_token,
    token_type: "bearer", expires_in: "3600", type: "recovery",
  });
}

async function comptePersiste(context: BrowserContext): Promise<string> {
  const morceaux = (await context.cookies(ORIGIN))
    .filter(cookie => /^sb-127-auth-token(?:\.\d+)?$/.test(cookie.name))
    .sort((gauche, droite) => gauche.name.localeCompare(droite.name, "en", { numeric: true }));
  expect(morceaux.length, "la session partagée reste présente après le changement de mot de passe").toBeGreaterThan(0);
  const valeur = morceaux.map(cookie => cookie.value).join("");
  const session = JSON.parse(valeur.startsWith("base64-") ? Buffer.from(valeur.slice(7), "base64url").toString() : valeur);
  const reponse = await context.request.get(AUTH + "user", { headers: { Authorization: `Bearer ${session.access_token}` } });
  expect(reponse.ok()).toBe(true);
  return (await reponse.json()).id;
}

async function remplir(page: Page) {
  await page.getByLabel(t("fr", "auth.password.ph"), { exact: true }).fill(PASSWORD);
  await page.getByLabel(t("fr", "reset.confirm.ph"), { exact: true }).fill(PASSWORD);
}

async function invalide(page: Page, calls: ReturnType<typeof observer>, lang: Lang = "fr") {
  await expect(page.getByText(t(lang, "reset.invalid"), { exact: true })).toBeVisible();
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
  expect(calls.updates).toHaveLength(0);
}

async function pageSaine(page: Page) {
  await expect(page).toHaveTitle(/\S/);
  await expect(page.locator("nextjs-portal, [data-nextjs-dialog-overlay], [data-nextjs-error-overlay]")).toHaveCount(0);
}

test("PKCE : le vrai vérificateur ouvre la récupération A malgré une session B existante", async ({ page, context }, testInfo) => {
  const calls = observer(page);
  await connecter(page, "b");
  const lien = await demanderLien(page, context);
  await page.goto(lien);
  await remplir(page);
  expect(calls.exchanges).toHaveLength(1);
  expect(calls.exchanges[0].postDataJSON().code_verifier).toBeTruthy();
  await expect(page).toHaveURL(new RegExp(RESET + "$"));
  await pageSaine(page);
  await page.screenshot({ path: testInfo.outputPath("recuperation-pkce-desktop.png"), fullPage: true });
  await page.getByRole("button", { name: t("fr", "reset.submit"), exact: true }).click();
  await expect(page.getByText(t("fr", "reset.success"), { exact: true })).toBeVisible();
  expect(calls.updates).toHaveLength(1);
  expect(acteur(calls.updates[0])).toBe(A);
  expect(calls.updates[0].postDataJSON().password).toBe(PASSWORD);
});

test("fragment : les jetons de récupération A remplacent la session B et sont effacés de l'URL", async ({ page, context }) => {
  const calls = observer(page);
  await connecter(page, "b");
  await page.goto(await fragment(context));
  await remplir(page);
  await expect(page).toHaveURL(new RegExp(RESET + "$"));
  await page.getByRole("button", { name: t("fr", "reset.submit"), exact: true }).click();
  await expect(page.getByText(t("fr", "reset.success"), { exact: true })).toBeVisible();
  expect(calls.exchanges).toHaveLength(0);
  expect(calls.updates).toHaveLength(1);
  expect(acteur(calls.updates[0])).toBe(A);
});

test("un code expiré ne réutilise jamais la session B déjà connectée", async ({ page, context }) => {
  const calls = observer(page);
  await connecter(page, "b");
  await page.goto(await demanderLien(page, context, true));
  await invalide(page, calls);
  expect(calls.exchanges).toHaveLength(1);
});

test("une erreur dans le lien ne réutilise jamais la session B déjà connectée", async ({ page }) => {
  const calls = observer(page);
  await connecter(page, "b");
  await page.goto(RESET + "#error=access_denied&error_code=otp_expired&type=recovery");
  await invalide(page, calls);
  expect(calls.exchanges).toHaveLength(0);
});

test("ouvrir directement la page avec la session B ne prouve aucune récupération", async ({ page }) => {
  const calls = observer(page);
  await connecter(page, "b");
  await page.goto(RESET);
  await invalide(page, calls);
  expect(calls.exchanges).toHaveLength(0);
});

test("un code sans vérificateur PKCE ne retombe jamais sur la session B", async ({ page }) => {
  const calls = observer(page);
  await connecter(page, "b");
  await page.goto(RESET + "?code=recovery-a." + "a".repeat(43));
  await invalide(page, calls);
  expect(calls.exchanges).toHaveLength(0);
});

test("un autre onglet connecte B après ouverture de la récupération A : aucun mot de passe n'est modifié", async ({ page, context }) => {
  const calls = observer(page);
  await page.goto(await fragment(context));
  await remplir(page);
  const autre = await context.newPage();
  await connecter(autre, "b");
  await page.getByRole("button", { name: t("fr", "reset.submit"), exact: true }).click();
  await invalide(page, calls);
  await autre.close();
});

test("une course après la lecture du compte A ne détourne jamais le PUT vers B", async ({ page, context }) => {
  const calls = observer(page);
  await page.goto(await fragment(context));
  await remplir(page);
  let confirmerLecture!: () => void;
  let libererLecture!: () => void;
  const lectureCommencee = new Promise<void>(resolve => { confirmerLecture = resolve; });
  const lectureLiberee = new Promise<void>(resolve => { libererLecture = resolve; });
  await page.route(AUTH + "user", async route => {
    if (route.request().method() !== "GET") return route.continue();
    const reponse = await route.fetch();
    expect((await reponse.json()).id).toBe(A);
    confirmerLecture();
    await lectureLiberee;
    await route.fulfill({ response: reponse });
  });
  await page.getByRole("button", { name: t("fr", "reset.submit"), exact: true }).click();
  await lectureCommencee;
  const autre = await context.newPage();
  try {
    await connecter(autre, "b");
  } finally {
    libererLecture();
  }
  await expect(page.getByText(t("fr", "reset.success"), { exact: true })).toBeVisible();
  expect(calls.updates).toHaveLength(1);
  expect(acteur(calls.updates[0])).toBe(A);
  expect(acteur(calls.updates[0])).not.toBe(B);
  expect(await comptePersiste(context)).toBe(B);
  await autre.close();
});

for (const lang of ["ht", "en", "es"] as const) {
  test(`lien invalide traduit et utilisable sur mobile : ${lang}`, async ({ page, context }, testInfo) => {
    const calls = observer(page);
    await page.setViewportSize({ width: 360, height: 800 });
    await connecter(page, "b");
    await context.addCookies([{ name: "zabelie_lang", value: lang, url: ORIGIN }]);
    await page.goto(RESET);
    await invalide(page, calls, lang);
    await pageSaine(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.getByRole("link", { name: t(lang, "auth.signin.cta"), exact: true })).toBeVisible();
    if (lang === "ht") await page.screenshot({ path: testInfo.outputPath("recuperation-invalide-ht-mobile.png"), fullPage: true });
  });
}
