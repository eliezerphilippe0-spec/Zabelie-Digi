import { test, expect, type Page } from "@playwright/test";
import { join } from "node:path";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";

async function login(page: Page, token: string) {
  const value = "base64-" + Buffer.from(JSON.stringify({
    access_token: token, refresh_token: "refresh-test", token_type: "bearer",
    expires_in: 3600, expires_at: 4102444800,
    user: { id: "22222222-2222-2222-2222-222222222222", aud: "authenticated", role: "authenticated", email: "pricing@example.ht", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" },
  })).toString("base64url");
  await page.context().addCookies([{ name: "sb-127-auth-token", value, domain: "127.0.0.1", path: "/" }]);
}
for (const width of [1280, 390]) {
  test("seller fees, launch status and net estimates at " + width + "px", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", e => errors.push(e.message));
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/vendre");
    await expect(page.getByRole("region", { name: "Tarifs vendeurs" })).toBeVisible();
    await login(page, "vendeur-preparation-pricing");
    await page.goto("/vendre");
    await expect(page.getByRole("region", { name: "Tarifs vendeurs" })).toBeVisible();
    const fees = page.getByRole("region", { name: "Tarifs vendeurs" });
    await expect(fees).toContainText("10 % + 66 HTG");
    await expect(fees).toContainText("30 %");
    await expect(fees).toContainText("3 ventes maximum pendant 30 jours");
    await expect(page.getByText(/Avantage disponible jusqu’au/)).toContainText("2 vente(s) restante(s)");
    await page.getByText("Créer une fiche numérique ou une prestation", { exact: true }).click();
    const input = page.getByRole("spinbutton", { name: /Prix.*HTG/ }).last();
    await input.fill("1000");
    await expect(page.locator('[aria-live="polite"]').filter({ hasText: "Vos liens et votre boutique" })).toContainText("834 HTG");
    await expect(page.locator('[aria-live="polite"]').filter({ hasText: "Vos liens et votre boutique" })).toContainText("700 HTG");
    await page.getByRole("combobox", { name: "Type de produit" }).selectOption("service");
    await expect(page.locator('[aria-live="polite"]').filter({ hasText: "Vos liens et votre boutique" })).toContainText("834 HTG");
    const dir = process.env.PRICING_QA_DIR || join(tmpdir(), "zabelie-pricing-qa");
    await mkdir(dir, { recursive: true });
    await fees.scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(dir, "vendeur-" + width + ".png"), fullPage: false });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
    await page.goto("/vendre/physique");
    await expect(page.getByRole("region", { name: "Tarifs vendeurs" })).toContainText("10 % + 66 HTG");
    await page.getByRole("spinbutton", { name: "Prix (HTG)", exact: true }).fill("1000");
    await expect(page.locator('[aria-live="polite"]').filter({ hasText: "Vos liens et votre boutique" })).toContainText("834 HTG");
    await expect(page.getByText(/Avantage disponible jusqu’au/)).toContainText("2 vente(s) restante(s)");
  });
}
test("catalogue click is attributed; direct URLs and prefetch are not", async ({ page }) => {
  await page.goto("/produit/filtre-huile-corolla");
  expect((await page.context().cookies()).some(c => c.name === "zabelie_sale_sources")).toBe(false);
  await page.request.get("/decouvrir/filtre-huile-corolla", { headers: { "next-router-prefetch": "1" } });
  expect((await page.context().cookies()).some(c => c.name === "zabelie_sale_sources")).toBe(false);
  await page.goto("/catalogue");
  await page.locator('a[href="/decouvrir/filtre-huile-corolla"]').first().click();
  await expect(page).toHaveURL(/\/produit\/filtre-huile-corolla$/);
  const cookie = (await page.context().cookies()).find(c => c.name === "zabelie_sale_sources");
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.sameSite).toBe("Lax");
  await expect(page.getByRole("heading", { name: "Filtre à huile Corolla", exact: true })).toBeVisible();
});
test("checkout ignores a forged source and respects the signed catalogue visit", async ({ page }) => {
  await login(page, "pricing-buyer");
  const data = { productId: "44444444-4444-4444-4444-444444444444", rail: "moncash", source: "discovery" };
  // The stub records inserts but deliberately refuses creating a payable order.
  await page.request.post("/api/checkout", { data });
  const writes = async () => (await (await page.request.get("http://127.0.0.1:54325/__ecritures")).json()).filter((e: { method: string }) => e.method === "POST");
  let rows = await writes();
  expect(JSON.parse(rows.at(-1).body)).toMatchObject({ zabelie_sale_source: "direct", zabelie_payment_is_live: false });
  await page.request.get("/decouvrir/filtre-huile-corolla");
  await page.request.post("/api/checkout", { data: { ...data, source: "direct" } });
  rows = await writes();
  expect(JSON.parse(rows.at(-1).body)).toMatchObject({ zabelie_sale_source: "discovery", zabelie_payment_is_live: false });
});
