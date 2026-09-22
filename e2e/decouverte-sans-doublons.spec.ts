
import { test, expect } from "@playwright/test";

for (const width of [390, 1440]) {
  test("discovery has no repeated offers and keeps search filters at " + width + "px", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/", { waitUntil: "networkidle" });
    await expect(page).toHaveTitle(/Zabelie/);
    await expect(page.locator("main h1")).toBeVisible();
    const offers = page.locator('main a[href^="/produit/"], main a[href^="/decouvrir/"]');
    const hrefs = await offers.evaluateAll(links => links.map(link => link.getAttribute("href")));
    expect(hrefs.length).toBeGreaterThan(0);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await offers.first().click();
    await expect(page).toHaveURL(/\/(produit|decouvrir)\//);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.goto("/catalogue?univers=numerique&q=zzzzintrouvable&max=2000&tri=prix-croissant");
    await expect(page.locator('main a[href^="/produit/"]')).toHaveCount(0);
    await page.getByRole("link", { name: "Effacer la recherche, garder les filtres" }).click();
    await expect(page).toHaveURL(url => !url.searchParams.has("q"));
    const url = new URL(page.url());
    expect(url.searchParams.has("q")).toBe(false);
    expect(url.searchParams.get("max")).toBe("2000");
    expect(url.searchParams.get("univers")).toBe("numerique");
    expect(url.searchParams.get("tri")).toBe("prix-croissant");
    await expect(page.locator('main a[href^="/produit/"]').first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}
