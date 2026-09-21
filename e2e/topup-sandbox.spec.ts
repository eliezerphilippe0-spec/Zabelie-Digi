import { test, expect } from "@playwright/test";

test("test mode is visible without offering a real purchase", async ({ page }) => {
  const browserErrors: string[] = [];
  page.on("pageerror", error => browserErrors.push(error.message));
  await page.goto("/recharges");
  await expect(page).toHaveTitle(/Recharges/);
  await expect(page.locator('header a[href="/recharges"]')).toContainText("En test");
  await expect(page.getByRole("main")).toContainText("Recharges en test : aucun crédit réel");
  await expect(page.getByRole("main").locator('a[href="/rechaj"]')).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath("sandbox-desktop.png"), fullPage: true });
  await page.goto("/rechaj");
  await expect(page).toHaveURL(/\/recharges$/);
  await expect(page.locator('input[type="tel"]')).toHaveCount(0);
  await expect(page.locator("nextjs-portal")).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: test.info().outputPath("sandbox-mobile.png"), fullPage: true });
  expect(browserErrors).toEqual([]);
});

test("even an enabled sales flag cannot create a Sandbox purchase", async ({ request }) => {
  const response = await request.post("/api/zabelie/topup/orders", { data: {} });
  expect(response.status()).toBe(503);
  expect(await response.json()).toEqual({ error: "Service de recharge non configuré." });
});
