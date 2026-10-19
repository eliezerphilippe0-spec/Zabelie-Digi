import { test, expect, type Page } from "@playwright/test";

/**
 * RUBRIQUE « PRODUITS » — corrections de l'audit du 2026-10-19 (PR #384).
 * UX-01 : une fiche archivée ne se dit plus « en revue » et ne gonfle plus les onglets.
 * UX-03 : le choix d'un type arrive sur le formulaire, même au téléphone.
 * UX-06 : le type se lit en titre du formulaire ; plus de sélecteur contradictoire.
 * UX-07 : un onglet vide mène au formulaire de son type.
 */
async function connecte(page: Page, jeton: string) {
  const session = { access_token: jeton, refresh_token: "test", token_type: "bearer", expires_at: 4102444800, expires_in: 3600, user: { id: "22222222-2222-2222-2222-222222222222", aud: "authenticated", role: "authenticated" } };
  await page.context().addCookies([
    { name: "sb-127-auth-token", value: "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url"), domain: "127.0.0.1", path: "/" },
    { name: "zabelie_lang", value: "fr", domain: "127.0.0.1", path: "/" },
  ]);
  await page.setViewportSize({ width: 360, height: 740 });
}
const onglets = (page: Page) => page.getByRole("navigation", { name: "Filtrer mes produits par type" });

test("une fiche archivée est rangée à part, et dit qu'elle est retirée de la vente", async ({ page }) => {
  await connecte(page, "vendeur-preparation-archive");
  await page.goto("/vendre");
  await expect(onglets(page).getByRole("link")).toHaveText(["Tous (2)", "Physiques (0)", "Services (1)", "Numériques (1)", "Archivés (1)"]);
  await expect(page.getByText("Service retiré test", { exact: true })).toHaveCount(0);

  await onglets(page).getByRole("link", { name: "Archivés (1)" }).click();
  await expect(page).toHaveURL(/\/vendre\?type=archivees#mes-produits$/);
  const fiche = page.locator("#produit-cccccccc-0000-4000-8000-000000000384");
  await expect(fiche.getByText("Archivé", { exact: true })).toBeVisible();
  await expect(fiche.getByText(/Retiré de la vente : ce produit n'apparaît plus au catalogue/)).toBeVisible();
  await expect(fiche.getByRole("link", { name: "Aide", exact: true })).toHaveAttribute("href", "/aide");
  await expect(fiche.getByText("En attente de revue")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("sans fiche archivée, pas d'onglet « Archivés » ; un onglet vide mène à son formulaire", async ({ page }) => {
  await connecte(page, "vendeur-preparation-produits");
  await page.goto("/vendre");
  await expect(onglets(page).getByRole("link")).toHaveText(["Tous (2)", "Physiques (0)", "Services (1)", "Numériques (1)"]);
  await onglets(page).getByRole("link", { name: "Physiques (0)" }).click();
  const vide = page.locator("#mes-produits").getByRole("status");
  await expect(vide).toContainText("Aucun produit de ce type pour le moment.");
  await expect(vide.getByRole("link", { name: "Créer une fiche" })).toHaveAttribute("href", "/vendre/physique");
});

test("le choix « Fichier numérique » arrive sur un formulaire titré, sans sélecteur ni modèles de service", async ({ page }) => {
  await connecte(page, "vendeur-preparation-produits");
  await page.goto("/vendre");
  await page.locator("#nouveau").getByRole("link", { name: /^Fichier numérique\b/ }).click();
  await expect(page).toHaveURL(/\/vendre\?nouveau=numerique#formulaire$/);
  const titre = page.locator("#formulaire").getByRole("heading", { name: "Nouveau fichier numérique", exact: true });
  await expect(titre).toBeInViewport();
  await expect(page.getByRole("combobox", { name: "Type de produit" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Diagnostic téléphone ou ordinateur", exact: true })).toHaveCount(0);
  await expect(page.locator("#formulaire").getByRole("link", { name: "Changer de type" })).toHaveAttribute("href", "/vendre#nouveau");
});
