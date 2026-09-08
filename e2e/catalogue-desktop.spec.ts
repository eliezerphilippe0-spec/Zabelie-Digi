import { test, expect } from "@playwright/test";
import { PRODUCTS } from "../lib/sample-data";
import { KIND_FILE } from "../lib/product-kind";

test("desktop filters apply to all results, sort by real price and preserve the universe", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/catalogue?univers=numerique&min=0&max=2000&tri=prix-croissant", { waitUntil: "networkidle" });
  const expected = PRODUCTS.filter((p) => p.kind === KIND_FILE && p.priceHTG <= 2000).sort((a, b) => a.priceHTG - b.priceHTG || a.slug.localeCompare(b.slug));
  const hrefs = await page.locator('main a[href^="/produit/"]').evaluateAll((links) => links.map((a) => a.getAttribute("href")));
  expect(hrefs).toEqual(expected.map((p) => `/produit/${p.slug}`));
  await expect(page.locator('input[name="q"]:visible')).toHaveCount(1);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await expect(page.locator('header:visible a[href="/panier"]')).toBeVisible();
  await expect(page.locator('header:visible a[href="/mes-achats"]').first()).toBeVisible();
  await page.locator('header:visible input[name="q"]').fill("Lightroom");
  await page.locator('header:visible form button[type="submit"]').click();
  await expect(page).toHaveURL(/q=Lightroom/);
  const url = new URL(page.url());
  expect(url.searchParams.get("max")).toBe("2000"); expect(url.searchParams.get("tri")).toBe("prix-croissant");
  await expect(page.locator("main")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test("an invalid price interval is explained without pretending the department is empty", async ({ page }) => {
  await page.goto("/catalogue?univers=numerique&min=1000&max=10");
  await expect(page.locator("main").getByRole("alert")).toContainText("prix minimum");
  await expect(page.locator('main a[href^="/produit/"]')).toHaveCount(0);
  await expect(page.locator("main")).not.toContainText("les premiers vendeurs");
});
test("a digital URL ignores handover zones and page two keeps its canonical", async ({ page }) => {
  await page.goto("/catalogue?univers=numerique&zd=inconnue");
  await expect(page.locator('main a[href^="/produit/"]').first()).toBeVisible();
  await expect(page.locator('select[name="zd"]')).toHaveCount(0);
  await page.goto("/catalogue?univers=numerique&page=2");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /univers=numerique&page=2$/);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
});
test("guides have URL-controlled language, reciprocal alternates and an accessible language switch", async ({ page, context }) => {
  await context.addCookies([{ name: "zabelie_lang", value: "fr", domain: "localhost", path: "/" }]);
  await page.goto("/guides/ht/produits-numeriques", { waitUntil: "networkidle" });
  await expect(page.locator("html")).toHaveAttribute("lang", "ht");
  await expect(page.locator("h1")).toHaveText("Chwazi epi jwenn yon fichye dijital");
  await expect(page.locator('link[rel="alternate"][hreflang]')).toHaveCount(5);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/guides\/ht\/produits-numeriques$/);
  await page.locator('header:visible summary[aria-label="Kreyòl ayisyen"]').click();
  await page.getByRole("button", { name: "English EN", exact: true }).click();
  await expect(page).toHaveURL(/\/guides\/en\/produits-numeriques$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator("h1")).toHaveText("Choosing and accessing a digital file");
  await expect(page.locator('header:visible details[open] summary[aria-label="English"]')).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("main")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test("the sitemap lists localized guides without login URLs or fabricated modification dates", async ({ request }) => {
  const result = await request.get("/sitemap.xml");
  expect(result.ok()).toBe(true); const xml = await result.text();
  expect(xml).toContain("/guides/ht/produits-numeriques");
  expect(xml).not.toContain("/connexion"); expect(xml).not.toContain("<lastmod>");
});
