import { test, expect, type Page } from "@playwright/test";
const serviceId = "66666666-6666-6666-6666-666666666666";
async function session(page: Page, seller = false) {
  const value = { access_token: seller ? "vendeur-preparation-commitment" : "acheteur-commitment", refresh_token: "test", token_type: "bearer", expires_at: 4102444800, expires_in: 3600, user: { id: seller ? "22222222-2222-2222-2222-222222222222" : "11111111-1111-1111-1111-111111111111", aud: "authenticated", role: "authenticated" } };
  await page.context().addCookies([{ name: "sb-127-auth-token", value: "base64-" + Buffer.from(JSON.stringify(value)).toString("base64url"), domain: "127.0.0.1", path: "/" }]);
}
test("seller saves delivery declarations and an explicit availability check", async ({ page }) => {
  await session(page, true);
  await page.goto("/vendre");
  const row = page.locator("#produit-" + serviceId);
  await row.getByText("Livraison et disponibilité", { exact: true }).click();
  await row.getByLabel("Communes / quartiers desservis").fill("Delmas et Pétion-Ville");
  await row.getByLabel("Délai annoncé en jours").fill("2");
  await row.getByLabel("Frais de remise").selectOption("included");
  await row.getByLabel("Je viens de vérifier la disponibilité").check();
  await row.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(row.getByRole("status")).toHaveText("Enregistré");
  await page.reload();
  await row.getByText("Livraison et disponibilité", { exact: true }).click();
  await expect(row.getByLabel("Communes / quartiers desservis")).toHaveValue("Delmas et Pétion-Ville");
  await expect(row.getByLabel("Je viens de vérifier la disponibilité")).not.toBeChecked();
});
test("commitments reject anonymous users, non-owners and malformed values", async ({ page }) => {
  const data = { productId: "44444444-4444-4444-4444-444444444444", details: { zones: "Delmas", pickup: "", delivery_days: 2, fees: "quote", next_available: null, confirmAvailability: true } };
  expect((await page.request.put("/api/products/commitments", { data })).status()).toBe(401);
  await session(page);
  expect((await page.request.put("/api/products/commitments", { data })).status()).toBe(404);
  await session(page, true);
  expect((await page.request.put("/api/products/commitments", { data: { ...data, productId: serviceId, details: { ...data.details, delivery_days: -1 } } })).status()).toBe(422);
});
test("recipient draft survives reload without restoring consent", async ({ page }) => {
  await session(page);
  await page.goto("/produit/filtre-huile-corolla");
  const section = page.locator("fieldset").filter({ has: page.getByText("Acheter pour un proche en Haïti", { exact: true }) });
  await section.locator('input[type="checkbox"]').first().check();
  await section.getByLabel("Nom du destinataire").fill("Marie Test");
  await section.getByLabel(/Commune/).fill("Delmas");
  await page.reload();
  await section.locator('input[type="checkbox"]').first().check();
  await expect(section.getByLabel("Nom du destinataire")).toHaveValue("Marie Test");
  await expect(section.locator('input[type="checkbox"]').last()).not.toBeChecked();
});
test("help includes the buyer order reference and a selected reason", async ({ page }) => {
  await session(page);
  await page.goto("/mes-achats");
  const help = page.locator("details").filter({ has: page.getByText("J’ai besoin d’aide", { exact: true }).first() }).first();
  await help.locator("summary").click();
  await help.locator("select").selectOption("notReceived");
  const copy = help.getByRole("textbox", { name: "Copier la demande", exact: true });
  await expect(copy).toHaveValue(/ZB-260720-TESTX/);
  await expect(copy).toHaveValue(/Article non reçu/);
});
