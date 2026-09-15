import { test, expect } from "@playwright/test";
for (const width of [320, 390, 768, 1440]) {
  test(`search stays usable at ${width}px including after scrolling`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/", { waitUntil: "networkidle" });
    const search = page.locator('header input[name="q"]');
    await expect(search).toHaveCount(1);
    const box = await search.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(width < 1024 ? width - 30 : 250);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.evaluate(() => scrollTo(0, 600));
    await expect(page.locator('header')).toHaveAttribute('data-compact', '');
    await expect(search).toBeInViewport();
    const compactBox = await search.boundingBox();
    expect(compactBox!.width).toBeGreaterThanOrEqual(width < 1024 ? width - 30 : 250);
    await expect(page.locator('header summary[aria-label="Français"]')).toBeVisible();
    await search.fill('Lightroom');
    await search.press('Enter');
    await expect(page).toHaveURL(/q=Lightroom/);
  });
}
test("launch status leads to payment availability and paused top-ups are announced before entry", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  const notice = page.locator('[data-marketplace-status]');
  await expect(notice).toContainText("Ouverture progressive");
  await expect(notice).toContainText("MonCash indisponible");
  await expect(page.locator('header a[href="/recharges"]')).toContainText("Indisponible");
  await expect(page.locator('main')).not.toContainText("Argent protégé");
  await notice.getByRole('link').click();
  await expect(page).toHaveURL(/\/recharges#paiements$/);
  await expect(page.locator('#paiements')).toContainText("MonCash indisponible");
  await expect(page.locator('#paiements')).toContainText("NatCash");
  await expect(page.locator('main a[href="/rechaj"]')).toHaveCount(0);
});
