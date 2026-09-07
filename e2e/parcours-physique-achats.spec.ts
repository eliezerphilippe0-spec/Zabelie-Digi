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


test("historique complet : aucun téléchargement ni avis sur les achats non confirmés", async ({ page }) => {
  await connecte(page, "historique-test");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/mes-achats");
  const rows = page.locator("main > ul > li");
  await expect(rows).toHaveCount(20);
  for (const title of ["Livre en attente", "Guide remboursé", "Objet en litige", "Article indisponible"]) {
    const row = rows.filter({ hasText: title });
    await expect(row).toBeVisible();
    await expect(row.getByRole("button", { name: "Télécharger" })).toHaveCount(0);
    await expect(row.getByRole("button", { name: "Laisser un avis" })).toHaveCount(0);
  }
  await expect(rows.filter({ hasText: "Prestation confirmée" }).getByRole("button", { name: "Laisser un avis" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "validation/achats-mobile.png", fullPage: true });
  await page.getByRole("link", { name: "Suivante", exact: true }).click();
  await expect(page).toHaveURL(/page=2/);
  await expect(page.locator("main > ul > li")).toHaveCount(9);
  await expect(page.getByRole("link", { name: "Suivante", exact: true })).toHaveCount(0);
});

test("bibliothèque : filtrage avant pagination et lien conservé entre les pages", async ({ page }) => {
  await connecte(page, "historique-test");
  await page.goto("/mes-achats?vue=numerique");
  await expect(page.locator("main > ul > li")).toHaveCount(20);
  await expect(page.getByText("Objet en litige", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Prestation confirmée", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Chaque lien", { exact: false })).toBeVisible();
  await expect(page.locator("main > ul > li").filter({ hasText: "Guide acquis 1" }).first().getByRole("button", { name: "Télécharger" })).toBeVisible();
  await page.getByRole("link", { name: "Suivante", exact: true }).click();
  await expect(page).toHaveURL(/vue=numerique&page=2/);
  await expect(page.locator("main > ul > li")).toHaveCount(6);
  await page.getByRole("link", { name: "Précédente", exact: true }).click();
  await expect(page).toHaveURL(/vue=numerique$/);
});

test("un incident de lecture ne se présente pas comme un historique vide", async ({ page }) => {
  await connecte(page, "historique-erreur");
  await page.goto("/mes-achats");
  await expect(page.locator("main").getByRole("alert")).toContainText("Impossible de charger vos commandes");
  await expect(page.getByRole("link", { name: "Réessayer", exact: true })).toBeVisible();
  await expect(page.getByText("Aucun achat", { exact: false })).toHaveCount(0);
});

test("vendeur : éléments manquants et délai nul correctement présentés", async ({ page }) => {
  await connecte(page, "vendeur-preparation");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/vendre");
  const guide = page.locator("li").filter({ has: page.getByText("Guide vendeur test", { exact: true }) });
  await expect(guide.getByText("Fichier à remettre · à compléter", { exact: true })).toBeVisible();
  await expect(guide.getByText("Photo du produit · à compléter", { exact: true })).toBeVisible();
  const service = page.locator("li").filter({ has: page.getByText("Prestation vendeur test", { exact: true }) });
  await expect(service.getByText("Délai de réalisation · renseigné", { exact: true })).toBeVisible();
  await expect(service.getByText("Fichier à remettre", { exact: false })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Lancer l’offre" })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "validation/vendeur-preparation-mobile.png", fullPage: true });
});

test("un lien direct ne contourne pas un paiement en attente ou un remboursement", async ({ page }) => {
  await connecte(page, "historique-test");
  for (const number of [1, 2, 3, 5]) {
    const id = `88888888-8888-8888-8888-${String(number).padStart(12, "0")}`;
    const response = await page.request.get(`/api/download?orderId=${id}`);
    expect(response.status()).toBe(403);
    expect((await response.json()).url).toBeUndefined();
  }
});
