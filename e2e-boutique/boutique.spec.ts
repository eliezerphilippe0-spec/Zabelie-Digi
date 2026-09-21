import { test, expect, type Page } from "@playwright/test";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdir } from "node:fs/promises";

async function connectAccount(page: Page, seller = true) {
  const value = "base64-" + Buffer.from(JSON.stringify({
    access_token: seller ? "vendeur-preparation-boutique" : "acheteur-boutique", refresh_token: "refresh-test", token_type: "bearer",
    expires_in: 3600, expires_at: 4102444800,
    user: { id: seller ? "22222222-2222-2222-2222-222222222222" : "11111111-1111-1111-1111-111111111111", aud: "authenticated", role: "authenticated",
      email: "vendeur@example.ht", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" },
  })).toString("base64url");
  await page.context().addCookies([{ name: "sb-127-auth-token", value, domain: "127.0.0.1", path: "/" }]);
}

async function screenshot(page: Page, name: string) {
  const dir = process.env.BOUTIQUE_QA_DIR || join(tmpdir(), "zabelie-boutique-qa");
  await mkdir(dir, { recursive: true });
  await page.screenshot({ path: join(dir, name + ".png"), fullPage: false });
}

for (const width of [390, 1280]) {
  test("public shop to digital purchase at " + width + "px", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", e => errors.push(e.message));
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/boutik/atelye-lakay");
    await expect(page).toHaveTitle(/Atelye Lakay/);
    await expect(page.getByRole("heading", { level: 1, name: "Atelye Lakay" })).toBeVisible();
    const offers = page.getByRole("region", { name: "Les offres de cette boutique" });
    await expect(offers.getByRole("link")).toHaveCount(3);
    await expect.poll(() => offers.locator("img").first().evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
    const digital = offers.getByRole("link").filter({ hasText: "Formation studio" });
    await expect(digital).toContainText("Apprenez à préparer");
    await expect(digital).toContainText("1 500 HTG");
    await expect(digital).toContainText("Voir l’offre");
    await expect(digital).toHaveAttribute("href", "/produit/formation-studio-test");
    expect((await digital.boundingBox())!.width).toBeGreaterThan(width < 600 ? 300 : 500);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await screenshot(page, "boutique-" + width);
    await digital.click();
    await expect(page).toHaveURL(/\/produit\/formation-studio-test$/);
    await expect(page.getByRole("heading", { level: 1, name: "Formation studio" })).toBeVisible();
    // The existing checkout is unique and precedes the complete course description.
    await expect(page.locator("#acheter")).toHaveCount(1);
    const buy = await page.locator("#acheter").boundingBox();
    const preview = await page.getByRole("region", { name: "Aperçu gratuit", exact: true }).boundingBox();
    expect(buy!.y).toBeLessThan(preview!.y);
    await page.getByText("2. Découverte", { exact: false }).click();
    await expect(page.getByText("FREE_SAMPLE: extrait consultable", { exact: true })).toBeVisible();
    expect(await page.content()).not.toContain("PRIVATE_SECRET");
    await page.getByRole("link", { name: /Acheter maintenant/ }).first().click();
    await expect(page).toHaveURL(/#acheter$/);
    await expect(page.locator("#acheter")).toBeInViewport();
    await expect.poll(async () => {
      const price = await page.locator("#acheter > p.numeric").boundingBox();
      const header = await page.locator("header").boundingBox();
      return !!price && !!header && price.y >= header.y + header.height;
    }).toBe(true);
    await screenshot(page, "achat-digital-" + width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await page.context().cookies()).some(c => c.name === "zabelie_sale_sources")).toBe(false);
    // The UI improvement never creates an anonymous order or bypasses sign-in.
    const checkout = page.waitForResponse(r => r.url().endsWith("/api/checkout"));
    await page.locator("#acheter").getByRole("button", { name: /MonCash/ }).click();
    expect((await checkout).status()).toBe(401);
    await expect(page).toHaveURL(/\/connexion\?next=/);
    expect(errors).toEqual([]);
  });
}

test("seller can open, edit and share the same public shop", async ({ page }) => {
  await connectAccount(page);
  await page.setViewportSize({ width: 390, height: 900 });
  const shared: string[] = [];
  await page.exposeFunction("recordShopShare", (value: string) => shared.push(value));
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", { value: {
      writeText: (value: string) => (window as unknown as { recordShopShare: (s: string) => Promise<void> }).recordShopShare(value),
    } });
    window.open = (url) => { void (window as unknown as { recordShopShare: (s: string) => Promise<void> }).recordShopShare(String(url)); return null; };
  });
  await page.goto("/tableau-de-bord");
  const shop = page.getByRole("region", { name: "Ma boutique" });
  await expect(shop).toBeVisible();
  await expect(shop.getByRole("link", { name: "Voir ma boutique", exact: true })).toHaveAttribute("href", "/boutik/atelye-lakay");
  await shop.getByRole("button", { name: "Copier le lien", exact: true }).click();
  await expect.poll(() => shared[0]).toBe("http://127.0.0.1:3006/boutik/atelye-lakay");
  await shop.getByRole("button", { name: /Partager sur WhatsApp/ }).click();
  await expect.poll(() => shared[1]).toContain("https://wa.me/?text=");
  expect(decodeURIComponent(shared[1])).toContain("/boutik/atelye-lakay");
  await shop.getByRole("link", { name: "Modifier ma présentation" }).click();
  await expect(page).toHaveURL(/#profil-public$/);
  await expect(page.locator("#profil-public")).toBeInViewport();
  await page.locator('summary[aria-label="Mon compte"]').click();
  await page.getByRole("link", { name: "Ma boutique", exact: true }).click();
  await expect(page).toHaveURL(/#ma-boutique$/);
  await page.locator('summary[aria-label="Mon compte"]').click();
  await expect.poll(async () => {
    const title = await page.locator("#ma-boutique-title").boundingBox();
    const header = await page.locator("header").boundingBox();
    return !!title && !!header && title.y >= header.y + header.height && title.y < 500;
  }).toBe(true);
  await screenshot(page, "ma-boutique-vendeur");
  await shop.getByRole("link", { name: "Voir ma boutique", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Atelye Lakay" })).toBeVisible();
});

test("legacy shop link, empty shop and Haitian Creole stay usable", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.context().addCookies([{ name: "zabelie_lang", value: "ht", domain: "127.0.0.1", path: "/" }]);
  await page.goto("/createur/22222222-2222-2222-2222-222222222222");
  await expect(page.getByRole("heading", { name: "Òf boutik sa a" })).toBeVisible();
  await expect(page.getByRole("link").filter({ hasText: "Formation studio" })).toContainText("Gade òf la");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await screenshot(page, "boutique-kreyol-360");
  await page.goto("/boutik/boutique-vide");
  await expect(page.getByText("Poko gen pwodui pibliye.", { exact: true })).toBeVisible();
  await expect(page.locator('a[href*="/produit/"]')).toHaveCount(0);
});


test("a buyer without products can prepare the shop from the same account", async ({ page }) => {
  await connectAccount(page, false);
  await page.goto("/tableau-de-bord");
  const shop = page.getByRole("region", { name: "Ma boutique" });
  await expect(shop).toBeVisible();
  await expect(shop.getByRole("link", { name: "Voir ma boutique", exact: true })).toHaveAttribute("href", "/createur/11111111-1111-1111-1111-111111111111");
  await page.locator('summary[aria-label="Mon compte"]').click();
  await expect(page.getByRole("link", { name: "Ma boutique", exact: true })).toBeVisible();
});
