import { test, expect, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

async function connect(page: Page, seller = true) {
  const value = "base64-" + Buffer.from(JSON.stringify({
    access_token: seller ? "vendeur-preparation-rabais" : "acheteur-rabais", refresh_token: "refresh-test", token_type: "bearer",
    expires_in: 3600, expires_at: 4102444800,
    user: { id: seller ? "22222222-2222-2222-2222-222222222222" : "11111111-1111-1111-1111-111111111111",
      aud: "authenticated", role: "authenticated", email: "rabais@example.ht", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" },
  })).toString("base64url");
  await page.context().addCookies([{ name: "sb-127-auth-token", value, domain: "127.0.0.1", path: "/" }]);
}
test.beforeEach(async ({ request }) => { await request.post("http://127.0.0.1:54327/__discount-reset"); });

for (const width of [390, 1280]) {
  test("seller discount is visible and charged on the chosen variant at " + width + "px", async ({ page, request }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", error => pageErrors.push(error.message));
    await page.setViewportSize({ width, height: 950 });
    await connect(page);
    await page.goto("/vendre");
    await expect(page.getByRole("heading", { name: "Rabais par taille ou modèle" })).toBeVisible();
    const medium = page.getByText("M", { exact: true }).locator("..");
    await medium.locator("summary").click();
    await medium.getByRole("spinbutton", { name: "Nouveau prix (HTG)" }).fill("1500");
    const changed = page.waitForResponse(r => r.url().endsWith("/api/products/discount"));
    await medium.getByRole("button", { name: "Poser le rabais" }).click();
    expect((await changed).status()).toBe(200);
    await expect(medium.locator("s")).toHaveText("2 000 HTG");
    await expect(medium.locator("summary")).toContainText("1 500 HTG");
    await connect(page, false);
    await page.goto("/produit/filtre-huile-corolla#acheter");
    await expect(page).toHaveTitle(/Filtre/);
    const small = page.getByRole("button", { name: /^M 2.?000 HTG 1.?500 HTG$/ });
    await expect(small.locator("s")).toHaveText("2 000 HTG");
    await page.getByRole("button", { name: /^L 2.?500 HTG$/ }).click();
    await expect(page.getByRole("button", { name: /Payer.*2.?500.*MonCash/ })).toBeVisible();
    await small.click();
    await expect(page.getByRole("button", { name: /Payer.*1.?500.*MonCash/ })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const dir = process.env.RABAIS_QA_DIR || join(tmpdir(), "zabelie-rabais-qa");
    await mkdir(dir, { recursive: true });
    await page.screenshot({ path: join(dir, "rabais-" + width + ".png") });
    const checkout = page.waitForResponse(r => r.url().endsWith("/api/checkout"));
    await page.getByRole("button", { name: /Payer.*1.?500.*MonCash/ }).click();
    // The provider has no credentials in this isolated test: no real payment starts.
    const result = await checkout;
    expect(result.status()).toBe(502);
    expect((await result.json()).code).toBe("provider_unavailable");
    const orders = await (await request.get("http://127.0.0.1:54327/__discount-orders")).json();
    expect(orders).toHaveLength(1);
    expect(orders[0].amount_htg).toBe(1500);
    await connect(page);
    const removed = await page.request.delete("/api/products/discount", { data: {
      productId: "44444444-4444-4444-4444-444444444444", variantId: "55555555-5555-5555-5555-555555555555",
    } });
    expect(removed.status()).toBe(200);
    await page.reload();
    const after = page.getByRole("button", { name: /^M 1.?500 HTG$/ });
    await expect(after.locator("s")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^L 2.?500 HTG$/ })).toBeVisible();
    expect(pageErrors).toEqual([]);
  });
}
test("a forged or missing variant cannot create a discounted order", async ({ page, request }) => {
  await connect(page, false);
  for (const variantId of [undefined, "55555555-5555-5555-5555-555555555599", "invalid"]) {
    const result = await page.request.post("/api/checkout", { data: { productId: "44444444-4444-4444-4444-444444444444", rail: "moncash", variantId, amount_htg: 1 } });
    expect(result.status()).toBe(422);
  }
  expect(await (await request.get("http://127.0.0.1:54327/__discount-orders")).json()).toEqual([]);
});
