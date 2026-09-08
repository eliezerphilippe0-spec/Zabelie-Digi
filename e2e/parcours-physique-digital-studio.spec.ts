import { test, expect, type Page } from "@playwright/test";

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




const ORDER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaa101";
const V1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaa011";
const V2 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaa012";
const ASSET = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaa021";

test("digital public preview exposes free text but never the paid lesson or private path", async ({ page }) => {
  await page.goto("/produit/formation-studio-test", { waitUntil: "networkidle" });
  await expect(page.getByText("Un extrait avant votre achat", { exact: true })).toBeVisible();
  await page.getByText("2. Découverte", { exact: false }).click();
  await expect(page.getByText("FREE_SAMPLE: extrait consultable", { exact: true })).toBeVisible();
  const html = await page.content();
  expect(html).not.toContain("PRIVATE_SECRET"); expect(html).not.toContain("studio/private.pdf");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test("private course preserves original license and progress across reloads", async ({ page }) => {
  await connecte(page, "digital-studio-buyer");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/mes-achats/${ORDER}`, { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "Formation version 1" })).toBeVisible();
  await expect(page.getByText("Licence originale conservée", { exact: true })).toBeVisible();
  await expect(page.getByText("PRIVATE_SECRET: votre méthode achetée", { exact: true })).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await page.getByRole("button", { name: "Marquer comme terminée", exact: true }).first().click();
  await expect(page.getByText("1 / 2 leçons terminées", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText("1 / 2 leçons terminées", { exact: true })).toBeVisible();
  await page.screenshot({ path: "validation/digital-library-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "validation/digital-library-mobile.png", fullPage: true });
  await page.getByRole("link", { name: "Version 2", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Formation version 2" })).toBeVisible();
  await expect(page.getByText("Licence originale conservée", { exact: true })).toBeVisible();
});
test("digital routes deny unpaid, refunded, foreign and unentitled version requests", async ({ page }) => {
  await connecte(page, "digital-studio-buyer");
  for (const [suffix, expected] of [["102", 403], ["103", 403], ["104", 404]] as const) {
    const id = ORDER.slice(0, -3) + suffix;
    const res = await page.request.get(`/api/download?orderId=${id}&assetId=${ASSET}`);
    expect(res.status()).toBe(expected); expect((await res.json()).url).toBeUndefined();
    await page.goto(`/mes-achats/${id}`); expect(await page.content()).not.toContain("PRIVATE_SECRET");
  }
  const noUpdates = ORDER.slice(0, -3) + "105";
  expect((await page.request.get(`/api/download?orderId=${noUpdates}&releaseId=${V1}`)).status()).toBe(404);
  expect((await page.request.get(`/api/download?orderId=${ORDER}&assetId=bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb`)).status()).toBe(404);
  const ok = await page.request.get(`/api/download?orderId=${ORDER}&releaseId=${V2}&assetId=${ASSET}`);
  expect(ok.status()).toBe(200); expect(ok.headers()["cache-control"]).toContain("no-store"); expect((await ok.json()).url).toContain("test-signed");
});
test("anonymous digital library and moderation files remain private", async ({ page }) => {
  await page.goto(`/mes-achats/${ORDER}`);
  expect(await page.content()).not.toContain("PRIVATE_SECRET");
  await expect(page.locator("main").getByRole("link", { name: "Connexion", exact: true })).toBeVisible();
  expect((await page.request.get(`/api/download?orderId=${ORDER}`)).status()).toBe(401);
  expect((await page.request.get(`/api/admin/digital-preview?productId=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaa001&assetId=${ASSET}`)).status()).toBe(403);
});
test("seller composes a course preview and lesson, saves and recovers it", async ({ page }) => {
  await connecte(page, "vendeur-preparation-studio");
  await page.goto("/vendre", { waitUntil: "networkidle" });
  const row = page.locator("#produit-77777777-7777-7777-7777-777777777777");
  const editor = row.locator("details").filter({ has: page.locator("summary", { hasText: "Atelier numérique" }) });
  await editor.locator("summary").first().click();
  await editor.getByLabel("Type de contenu", { exact: true }).selectOption("course");
  await editor.getByLabel("Aperçu gratuit", { exact: true }).fill("Essayez ce premier extrait.");
  await editor.getByRole("button", { name: "Ajouter une leçon", exact: true }).click();
  await editor.getByLabel("Titre de la leçon", { exact: true }).fill("Premiers pas");
  await editor.getByLabel("Contenu de la leçon", { exact: true }).fill("Votre contenu réservé aux acheteurs.");
  await editor.getByRole("button", { name: "Enregistrer l’atelier", exact: true }).click();
  await expect(editor.getByRole("status")).toHaveText("Atelier enregistré.");
  await page.reload({ waitUntil: "networkidle" });
  await editor.locator("summary").first().click();
  await expect(editor.getByLabel("Titre de la leçon", { exact: true })).toHaveValue("Premiers pas");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await row.screenshot({ path: "validation/digital-studio-mobile.png" });
});
