import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { t, type Lang } from "../lib/i18n";

/**
 * SIGNAUX DE DEMANDE (docs/75 §5.C, PR-Z4). Vraie page « Mes clients », seuls
 * Auth/PostgREST sont simulés. Les signaux s'affichent même sans aucune vente :
 * c'est avant la première commande qu'ils servent le plus.
 */

const STUB = "http://127.0.0.1:15421";

async function vendeur(request: APIRequestContext, page: Page, lang: Lang, signaux?: true | "fuite") {
  const scenario = randomUUID(), actorA = randomUUID(), actorB = randomUUID();
  const init = await request.post(`${STUB}/__profile-identity`, { data: { scenario, actorA, actorB, clients: "vide", ...(signaux ? { signaux } : {}) } });
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
  test(`signaux : abonnés, paniers (jamais un compte sous 3), recherches — ${lang}, ${largeur} px`, async ({ page, request }) => {
    await page.setViewportSize({ width: largeur, height: 900 });
    const { actorA, etat } = await vendeur(request, page, lang, true);
    await page.goto("/tableau-de-bord/clients");
    await expect(page.getByText(t(lang, "vendeur.clients.vide"), { exact: true })).toBeVisible();

    const section = page.locator("#signaux");
    await expect(section.getByRole("heading", { name: t(lang, "vendeur.signaux.titre"), exact: true })).toBeVisible();
    await expect(section.locator("dd").first()).toHaveText("2");
    const paniers = section.locator("#signaux-paniers li");
    await expect(paniers).toHaveCount(2);
    await expect(paniers.nth(0)).toContainText(t(lang, "vendeur.signaux.paniers.n", { n: "4" }));
    await expect(paniers.nth(1)).toContainText(t(lang, "vendeur.signaux.paniers.peu"));
    const recherches = section.locator("#signaux-recherches li");
    await expect(recherches).toHaveCount(2);
    await expect(recherches.nth(0)).toContainText("konvètisè");
    await expect(recherches.nth(0)).toContainText(t(lang, "vendeur.signaux.rayon"));
    await expect(recherches.nth(1)).not.toContainText(t(lang, "vendeur.signaux.rayon"));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await section.screenshot({ path: test.info().outputPath(`signaux-${lang}-${largeur}.png`) });

    const { signaux } = await etat();
    expect(signaux.reads).toEqual([{ tokenActorId: actorA, serviceRole: false }]);
  });
}

test("signaux : une réponse qui laisse sortir un compte de 2 paniers est refusée, la section se tait", async ({ page, request }) => {
  await vendeur(request, page, "fr", "fuite");
  await page.goto("/tableau-de-bord/clients");
  await expect(page.getByRole("heading", { level: 1, name: t("fr", "vendeur.clients.titre"), exact: true })).toBeVisible();
  await expect(page.locator("#signaux")).toHaveCount(0);
  await expect(page.getByText("Batri fiktif")).toHaveCount(0);
});

test("signaux : tant que 0156 n'est pas appliquée, la section se tait et la page reste entière", async ({ page, request }) => {
  await vendeur(request, page, "fr");
  await page.goto("/tableau-de-bord/clients");
  await expect(page.getByText(t("fr", "vendeur.clients.vide"), { exact: true })).toBeVisible();
  await expect(page.locator("#signaux")).toHaveCount(0);
});
