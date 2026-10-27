import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { t, type Lang } from "../lib/i18n";

/**
 * QR DE LA VITRINE ET AFFICHE A5 (docs/75 §5.A, PR-Z1). Vraies pages, seuls
 * Auth/PostgREST sont simulés (`e2e/fixtures/stub-supabase.mjs`, scénario
 * `__profile-identity`, dont le vendeur n'a pas de slug : le QR mène donc à
 * /createur/<id>, le repli de `hrefBoutique`).
 */

const STUB = "http://127.0.0.1:15421";

async function vendeur(request: APIRequestContext, page: Page, lang: Lang) {
  const scenario = randomUUID(), actorA = randomUUID(), actorB = randomUUID();
  const init = await request.post(`${STUB}/__profile-identity`, { data: { scenario, actorA, actorB } });
  expect(init.status()).toBe(200);
  const session = { access_token: `profile-identity-${actorA}`, refresh_token: "fixture", token_type: "bearer", expires_at: 4102444800, expires_in: 3600,
    user: { id: actorA, aud: "authenticated", role: "authenticated" } };
  await page.context().addCookies([
    { name: "sb-127-auth-token", value: "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url"), domain: "127.0.0.1", path: "/" },
    { name: "zabelie_lang", value: lang, domain: "127.0.0.1", path: "/" },
  ]);
  return { actorA, nom: `Profil A ${scenario.slice(0, 8)}` };
}

const imageChargee = (page: Page, selecteur: string) =>
  page.locator(selecteur).evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0);
const sansDefilementHorizontal = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);

for (const { lang, largeur } of [{ lang: "ht" as Lang, largeur: 390 }, { lang: "fr" as Lang, largeur: 1280 }]) {
  test(`QR de la vitrine puis affiche A5 — ${lang}, ${largeur} px`, async ({ page, request }) => {
    const erreurs: string[] = [];
    page.on("console", (m) => { if (m.type() === "error") erreurs.push(m.text()); });
    await page.setViewportSize({ width: largeur, height: 900 });
    const { actorA, nom } = await vendeur(request, page, lang);

    await page.goto("/tableau-de-bord/boutique");
    const bloc = page.locator("#qr");
    await expect(bloc.getByRole("heading", { name: t(lang, "vendeur.qr.titre"), exact: true })).toBeVisible();
    const image = bloc.locator("img");
    await expect(image).toHaveAttribute("alt", new RegExp(`/createur/${actorA}$`));
    expect(await imageChargee(page, "#qr img")).toBe(true);
    const telecharger = bloc.getByRole("link", { name: t(lang, "vendeur.qr.telecharger"), exact: true });
    await expect(telecharger).toHaveAttribute("download", `zabelie-${actorA}-qr.svg`);
    await expect(telecharger).toHaveAttribute("href", /^data:image\/svg\+xml;charset=utf-8,/);
    expect(await sansDefilementHorizontal(page)).toBe(true);
    await bloc.screenshot({ path: test.info().outputPath(`qr-${lang}-${largeur}.png`) });

    await bloc.getByRole("link", { name: t(lang, "vendeur.qr.affiche"), exact: true }).click();
    await expect(page).toHaveURL(/\/tableau-de-bord\/boutique\/affiche$/);
    await expect(page.getByRole("heading", { level: 1, name: t(lang, "vendeur.affiche.titre"), exact: true })).toBeVisible();
    await expect(page.getByText(nom, { exact: true })).toBeVisible();
    expect(await imageChargee(page, "article.affiche img")).toBe(true);
    const imprimer = page.getByRole("button", { name: t(lang, "vendeur.affiche.imprimer"), exact: true });
    await expect(imprimer).toBeVisible();
    expect(await sansDefilementHorizontal(page)).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`affiche-${lang}-${largeur}.png`), fullPage: true });

    await page.emulateMedia({ media: "print" });
    await expect(imprimer).toBeHidden();
    await expect(page.locator("article.affiche img")).toBeVisible();
    await page.screenshot({ path: test.info().outputPath(`affiche-impression-${lang}-${largeur}.png`), fullPage: true });
    await page.emulateMedia({ media: null });

    expect(erreurs).toEqual([]);
  });
}

test("affiche : un visiteur non connecté est renvoyé vers la connexion, sans QR", async ({ page }) => {
  await page.goto("/tableau-de-bord/boutique/affiche");
  await expect(page).toHaveURL(/\/connexion\?next=%2Ftableau-de-bord%2Fboutique%2Faffiche$/);
  await expect(page.locator("article.affiche")).toHaveCount(0);
});
