import { test, expect } from "@playwright/test";

// Uses the existing local Supabase fixture. No external model or real payment.
test("guided shopping compares stock-backed offers then opens the existing purchase page", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/assistant");
  await expect(page.getByRole("heading", { name: "Assistant d’achat Zabelie", exact: true })).toBeVisible();
  await page.getByLabel("Quel produit ou service cherchez-vous ?", { exact: true }).fill("filtre");
  await page.getByLabel("Quel est votre budget maximum en HTG ?", { exact: true }).fill("2000");
  await page.getByLabel("À quoi servira votre achat ?", { exact: true }).fill("Toyota Corolla");
  await page.getByLabel("Dans quelle ville ou localité êtes-vous ?", { exact: true }).fill("Delmas");
  await page.getByRole("button", { name: "Comparer les offres", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Filtre à huile Corolla", exact: true })).toBeVisible();
  await expect(page.locator("article")).toHaveCount(1);
  await expect(page.getByText("À partir de 1 500 HTG", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("link", { name: "Choisir et payer", exact: true }).click();
  await expect(page).toHaveURL(/\/produit\/filtre-huile-corolla$/);
});

test("an insufficient budget returns an honest empty result", async ({ request }) => {
  const response = await request.post("/api/ai/shopping", { data: { lang: "fr", intent: {
    query: "filtre", budgetHtg: 1499, need: "Toyota Corolla", location: "Delmas", kind: null,
  } } });
  expect(response.status()).toBe(200);
  expect((await response.json()).recommendations).toEqual([]);
});
