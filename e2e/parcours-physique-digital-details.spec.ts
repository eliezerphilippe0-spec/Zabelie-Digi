import { test, expect, type Page } from "@playwright/test";
import { EMPTY_DIGITAL_DETAILS } from "../lib/digital-details";
async function connecte(page: Page, token: string) {
  const session = {
    access_token: token,
    refresh_token: "rafraichissement-de-test",
    token_type: "bearer",
    expires_in: 3600,
    // Très loin dans le futur : sinon le client tente un rafraîchissement.
    expires_at: 4102444800,
    user: {
      id: "11111111-1111-1111-1111-111111111111",
      aud: "authenticated",
      role: "authenticated",
      email: "achte@example.ht",
      app_metadata: {},
      user_metadata: {},
      created_at: "2026-01-01T00:00:00Z",
    },
  };
  const value =
    "base64-" + Buffer.from(JSON.stringify(session), "utf8").toString("base64url");
  await page.context().addCookies([
    { name: "sb-127-auth-token", value, domain: "127.0.0.1", path: "/" },
  ]);
}




test("a seller saves digital facts on their draft and finds them after reload", async ({ page }) => {
  await connecte(page, "vendeur-preparation-digital");
  await page.goto("/vendre");
  const row = page.locator('#produit-77777777-7777-7777-7777-777777777777');
  if (await row.locator("details").filter({ has: page.getByText("Caractéristiques du fichier numérique", { exact: true }) }).getAttribute("open") === null) await row.getByText("Caractéristiques du fichier numérique", { exact: true }).click();
  await row.getByRole("textbox", { name: "Formats des fichiers", exact: true }).fill("PDF");
  await row.getByRole("textbox", { name: "Licence et usages autorisés", exact: true }).fill("Usage personnel uniquement");
  await row.getByRole("button", { name: "Enregistrer les caractéristiques", exact: true }).click();
  await expect(row.getByRole("status")).toHaveText("Caractéristiques enregistrées.");
  await page.reload();
  if (await row.locator("details").filter({ has: page.getByText("Caractéristiques du fichier numérique", { exact: true }) }).getAttribute("open") === null) await row.getByText("Caractéristiques du fichier numérique", { exact: true }).click();
  await expect(row.getByRole("textbox", { name: "Formats des fichiers", exact: true })).toHaveValue("PDF");
  await expect(row.getByRole("textbox", { name: "Licence et usages autorisés", exact: true })).toHaveValue("Usage personnel uniquement");
});
test("digital facts reject another seller, wrong product type, and oversized input", async ({ page }) => {
  await connecte(page, "digital-details-other");
  const body = { productId: "44444444-4444-4444-4444-444444444444", details: EMPTY_DIGITAL_DETAILS };
  expect((await page.request.put("/api/products/digital-details", { data: body })).status()).toBe(404);
  await connecte(page, "vendeur-preparation-digital-api");
  expect((await page.request.put("/api/products/digital-details", { data: { ...body, productId: "66666666-6666-6666-6666-666666666666" } })).status()).toBe(409);
  expect((await page.request.put("/api/products/digital-details", { data: { ...body, details: { ...EMPTY_DIGITAL_DETAILS, formats: "X".repeat(101) } } })).status()).toBe(422);
});
