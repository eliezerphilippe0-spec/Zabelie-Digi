import { test, expect } from "@playwright/test";

// Slug d'un produit des données d'exemple (mode démo).
const PRODUCT = "/produit/pack-presets-lightroom-afro";
const GATEWAY =
  "https://sandbox.moncashbutton.digicel.com/Moncash-middleware/Payment/Redirect?token=demo";

test.describe("Chemin de l'argent", () => {
  test("erreur opérateur : vérifier les achats avant tout second paiement", async ({ page }) => {
    const requests: Record<string, unknown>[] = [];
    await page.route("**/api/checkout", route => {
      requests.push(route.request().postDataJSON());
      return route.fulfill({ status: 502, contentType: "application/json", body: JSON.stringify({ code: "provider_unavailable" }) });
    });
    await page.goto(PRODUCT);
    const pay = page.getByRole("button", { name: /MonCash/ });
    await pay.click();
    await expect(page.getByText("La tentative doit être vérifiée.", { exact: false })).toBeVisible();
    await expect(page.getByRole("link", { name: "Vérifier ma commande", exact: true })).toBeVisible();
    await expect(pay).toBeDisabled();
    expect(requests).toHaveLength(1);
    expect(requests[0].checkoutKey).toMatch(/^[0-9a-f-]{36}$/);
    await page.reload();
    // Demo has no account draft scope. A reload must still keep the same
    // server attempt key, so its retry cannot create another order.
    await page.getByRole("button", { name: /MonCash/ }).click();
    await expect(page.getByRole("button", { name: /MonCash/ })).toBeDisabled();
    expect(requests).toHaveLength(2);
    expect(requests[1].checkoutKey).toBe(requests[0].checkoutKey);
  });
  test("checkout réussi → redirection vers la passerelle MonCash", async ({
    page,
  }) => {
    // /api/checkout mocké : renvoie une URL de redirection MonCash.
    await page.route("**/api/checkout", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ redirectUrl: GATEWAY, orderId: "o-demo" }),
      })
    );
    // On intercepte la passerelle externe pour ne pas charger le vrai site.
    await page.route("**/Moncash-middleware/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<html><body>MonCash gateway</body></html>",
      })
    );

    await page.goto(PRODUCT);
    await page.getByRole("button", { name: /MonCash/ }).click();

    await page.waitForURL(/Payment\/Redirect/);
    expect(page.url()).toContain("Payment/Redirect");
  });

  test("checkout non authentifié → redirection vers /connexion", async ({
    page,
  }) => {
    await page.route("**/api/checkout", (route) =>
      route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "Authentification requise" }),
      })
    );

    await page.goto(PRODUCT);
    await page.getByRole("button", { name: /MonCash/ }).click();

    // La redirection porte ?next=<page produit> : le contexte d'achat est
    // préservé (retour automatique après connexion, delta checkout P1).
    await page.waitForURL(/\/connexion\?next=/);
    expect(page.url()).toContain("/connexion");
    expect(decodeURIComponent(page.url())).toContain("next=/produit/");
  });

  test("page succès affiche la confirmation", async ({ page }) => {
    await page.goto("/paiement/succes?commande=abcdef12");
    await expect(
      page.getByRole("heading", { name: /Paiement confirmé/ })
    ).toBeVisible();
  });

  test("page échec montre le motif (montant rejeté)", async ({ page }) => {
    await page.goto("/paiement/echec?raison=montant");
    await expect(
      page.getByRole("heading", { name: /Paiement non confirmé/ })
    ).toBeVisible();
    await expect(page.getByText(/montant/)).toBeVisible();
  });

  test("page en attente rassure sur le rattrapage", async ({ page }) => {
    await page.goto("/paiement/en-attente");
    await expect(
      page.getByRole("heading", { name: /vérification/ })
    ).toBeVisible();
  });
});
