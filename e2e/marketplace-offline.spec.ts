import { test, expect } from "@playwright/test";

test("marketplace retains dated public offers across a real network cut", async ({ page, context }) => {
  test.setTimeout(90000);
  await page.goto("/produit/pack-presets-lightroom-afro");
  await expect(page.getByRole("heading", { name: /Pack 24 presets/ })).toBeVisible();
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  // The new worker intentionally waits for the next navigation before controlling the page.
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("zabelie:public-listings:v1") || "[]").length)).toBeGreaterThan(0);
  await context.setOffline(true);
  await page.goto("/catalogue");
  await expect(page.getByRole("heading", { name: "Offres récemment consultées" })).toBeVisible();
  await expect(page.getByText("Pack 24 presets Lightroom — Afro Tones", { exact: true })).toBeVisible();
  await expect(page.getByText(/Les prix et stocks peuvent avoir changé/)).toBeVisible();
  await expect(page.getByRole("button", { name: /Payer/ })).toHaveCount(0);
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: test.info().outputPath("offline-" + width + ".png"), fullPage: true });
  }
  await page.goto("/mes-achats");
  await expect(page.getByRole("heading", { name: "Offres récemment consultées" })).toBeVisible();
  const cached = await page.evaluate(async () => {
    const urls = [];
    for (const key of await caches.keys()) for (const req of await (await caches.open(key)).keys()) urls.push(new URL(req.url).pathname);
    return urls;
  });
  expect(cached.some(path => /^\/(api\/|mes-achats|paiement|panier)/.test(path))).toBe(false);
  await context.setOffline(false);
  await page.getByRole("link", { name: "Ouvrir et vérifier en ligne" }).click();
  await expect(page).toHaveURL(/\/produit\/pack-presets/);
  await expect(page.getByRole("heading", { name: /Pack 24 presets/ })).toBeVisible();
  await page.goto("/hors-ligne");
  await page.getByRole("button", { name: "Effacer les offres enregistrées" }).click();
  await expect(page.getByText("Aucune offre enregistrée sur cet appareil.")).toBeVisible();
});

test("uncertain checkout leads to purchases instead of allowing a second submission", async ({ page }) => {
  await page.goto("/produit/pack-presets-lightroom-afro");
  let calls = 0;
  await page.route("**/api/checkout", route => { calls++; return route.abort("failed"); });
  const pay = page.getByRole("button", { name: /Payer .*MonCash/ }).first();
  await pay.click();
  await expect(page.getByRole("link", { name: "Vérifier ma commande", exact: true })).toBeVisible();
  await expect(pay).toBeDisabled();
  expect(calls).toBe(1);
});

test("unconfigured top-ups are explained without a buy link", async ({ page }) => {
  await page.goto("/recharges");
  await expect(page.getByText("Recharges temporairement indisponibles")).toBeVisible();
  await expect(page.locator('a[href="/rechaj"]')).toHaveCount(0);
});
