import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { t, type Lang } from "../lib/i18n";

/**
 * VISITES DES VITRINES (docs/75 §5.A, PR-Z2). Vraies pages, seuls Auth/PostgREST
 * sont simulés. Le stub consigne chaque appel au compteur (0155) : on vérifie
 * qu'un vrai navigateur compte, qu'un robot ou un aperçu WhatsApp ne compte pas,
 * et que le vendeur lit ses chiffres — ou rien, tant que 0155 n'est pas appliquée.
 */

const STUB = "http://127.0.0.1:15421";
const CHROME_ANDROID = "Mozilla/5.0 (Linux; Android 13; SM-A145F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36";

const appels = async (request: APIRequestContext, vendeur: string) =>
  (await (await request.get(`${STUB}/__boutik-visites?seller=${vendeur}`)).json()) as { seller: string; serviceRole: boolean }[];

test("vitrine : un vrai navigateur compte une vue ; robot, aperçu WhatsApp et navigateur sans écran, non", async ({ browser, request }) => {
  const vendeur = randomUUID();
  const adresse = `/boutik/v-${vendeur.replaceAll("-", "")}`;
  const baseURL = test.info().project.use.baseURL;
  const visiter = async (userAgent?: string) => {
    const ctx = await browser.newContext({ baseURL, ...(userAgent ? { userAgent } : {}) });
    const page = await ctx.newPage();
    const reponse = await page.goto(adresse);
    expect(reponse?.status()).toBe(200);
    await expect(page.getByText("Boutik vizit fiktif").first()).toBeVisible();
    await ctx.close();
  };

  await visiter(CHROME_ANDROID);
  await expect.poll(async () => (await appels(request, vendeur)).length).toBe(1);

  await visiter("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)");
  await visiter("WhatsApp/2.24.21.80 A");
  await visiter("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/129.0.0.0 Safari/537.36");
  await visiter(CHROME_ANDROID);
  await expect.poll(async () => (await appels(request, vendeur)).length).toBe(2);
  await new Promise((r) => setTimeout(r, 1500));
  const tous = await appels(request, vendeur);
  expect(tous).toHaveLength(2);
  expect(tous.every((a) => a.serviceRole)).toBe(true);
});

async function vendeurConnecte(request: APIRequestContext, page: Page, lang: Lang, visites: boolean) {
  const scenario = randomUUID(), actorA = randomUUID(), actorB = randomUUID();
  const init = await request.post(`${STUB}/__profile-identity`, { data: { scenario, actorA, actorB, clients: true, ...(visites ? { visites: true } : {}) } });
  expect(init.status()).toBe(200);
  const session = { access_token: `profile-identity-${actorA}`, refresh_token: "fixture", token_type: "bearer", expires_at: 4102444800, expires_in: 3600,
    user: { id: actorA, aud: "authenticated", role: "authenticated" } };
  await page.context().addCookies([
    { name: "sb-127-auth-token", value: "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url"), domain: "127.0.0.1", path: "/" },
    { name: "zabelie_lang", value: lang, domain: "127.0.0.1", path: "/" },
  ]);
  return { actorA, etat: async () => (await request.get(`${STUB}/__profile-identity?scenario=${scenario}`)).json() };
}

for (const { lang, largeur } of [{ lang: "ht" as Lang, largeur: 390 }, { lang: "fr" as Lang, largeur: 1280 }]) {
  test(`tableau : vues, commandes réelles et rapport sur 30 jours — ${lang}, ${largeur} px`, async ({ page, request }) => {
    await page.setViewportSize({ width: largeur, height: 900 });
    const { actorA, etat } = await vendeurConnecte(request, page, lang, true);
    await page.goto("/tableau-de-bord/boutique");
    const section = page.locator("#visites");
    await expect(section.getByRole("heading", { name: t(lang, "vendeur.visites.titre"), exact: true })).toBeVisible();
    const valeur = (cle: Parameters<typeof t>[1]) => section.locator("div").filter({ hasText: t(lang, cle) }).locator("dd");
    await expect(valeur("vendeur.visites.vues")).toHaveText("100");
    await expect(valeur("vendeur.visites.commandes")).toHaveText("1");
    await expect(valeur("vendeur.visites.taux")).toHaveText("1,0");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await section.screenshot({ path: test.info().outputPath(`visites-${lang}-${largeur}.png`) });

    const { visites } = await etat();
    expect(visites.reads).toHaveLength(1);
    expect(visites.reads[0]).toMatchObject({ tokenActorId: actorA, serviceRole: false });
  });
}

test("tableau : tant que 0155 n'est pas appliquée, la section se tait et la page reste entière", async ({ page, request }) => {
  await vendeurConnecte(request, page, "fr", false);
  await page.goto("/tableau-de-bord/boutique");
  await expect(page.locator("#qr img")).toBeVisible();
  await expect(page.locator("#visites")).toHaveCount(0);
});
