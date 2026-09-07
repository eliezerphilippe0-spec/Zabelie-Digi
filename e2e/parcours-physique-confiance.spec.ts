import { test, expect, type Page } from "@playwright/test";
import { resolve } from "node:path";

const PRODUCT_ID = "44444444-4444-4444-4444-444444444444";
const PRODUCT_PATH = "/produit/filtre-huile-corolla";

async function connecte(page: Page) {
  // Local stub session only; no real account, email or payment.
  const session = {
    access_token: "jeton-de-test", refresh_token: "rafraichissement-de-test",
    token_type: "bearer", expires_in: 3600, expires_at: 4102444800,
    user: { id: "11111111-1111-1111-1111-111111111111", aud: "authenticated", role: "authenticated" },
  };
  await page.context().addCookies([{
    name: "sb-127-auth-token",
    value: "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url"),
    domain: "127.0.0.1", path: "/",
  }]);
}

for (const width of [390, 1440]) {
  test(`la remise précède le paiement et la connexion conserve la fiche (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(PRODUCT_PATH);
    const advice = page.getByRole("region", { name: "Avant de payer, convenez de la remise" });
    await expect(advice).toBeVisible();
    const contact = advice.getByRole("link", { name: "Poser ma question au vendeur" });
    const href = await contact.getAttribute("href");
    expect(new URL(href!, "http://localhost").searchParams.get("next")).toBe(`${PRODUCT_PATH}#contacter-vendeur`);
    const payment = page.getByRole("button", { name: /Payer .*MonCash/ }).first();
    expect((await advice.boundingBox())!.y).toBeLessThan((await payment.boundingBox())!.y);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`fiche-${width}.png`), fullPage: true });
    await contact.click();
    await expect(page).toHaveURL(/\/connexion\?next=/);
  });
}

test("un acheteur connecté peut ouvrir la messagerie avant tout achat", async ({ page }) => {
  await connecte(page);
  await page.goto(PRODUCT_PATH);
  await page.getByRole("link", { name: "Poser ma question au vendeur" }).click();
  await expect(page).toHaveURL(/#contacter-vendeur$/);
  await expect(page.locator("#contacter-vendeur textarea")).toBeVisible();
});

for (const failure of ["http", "network"] as const) {
  test(`la reprise d'une photo après erreur ${failure} ne recrée pas le brouillon`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await connecte(page);
    let creations = 0;
    let uploads = 0;
    await page.route("**/api/products/physical", async (route) => {
      if (route.request().method() === "GET") {
        return route.fulfill({ json: { categories: [
          { id: "root", slug: "maison", level: 1, label_fr: "Maison", label_kr: "Kay", parent_id: null, position: 0 },
          { id: "child", slug: "accessoires", level: 2, label_fr: "Accessoires", label_kr: "Akseswa", parent_id: "root", position: 0 },
        ], models: [] } });
      }
      creations++;
      expect(route.request().postDataJSON().title).toBe("Lampe rechargeable");
      return route.fulfill({ json: { productId: PRODUCT_ID } });
    });
    await page.route("**/api/products/cover", async (route) => {
      uploads++;
      expect(route.request().postDataBuffer()!.toString()).toContain(PRODUCT_ID);
      if (uploads === 1) {
        if (failure === "network") return route.abort("failed");
        return route.fulfill({ status: 500, json: { error: "storage-unavailable" } });
      }
      return route.fulfill({ json: { ok: true } });
    });
    await page.goto("/vendre/physique");
    await page.getByLabel("Titre", { exact: true }).fill("Lampe rechargeable");
    await page.getByLabel("Prix (HTG)", { exact: true }).fill("1500");
    await page.getByLabel("Quantité en stock").fill("2");
    await page.getByLabel("Catégorie", { exact: true }).selectOption("accessoires");
    await page.getByLabel("Description du produit", { exact: true }).fill("Lampe neuve. Remise à convenir à Pétion-Ville.");
    await page.locator('input[type="file"]').setInputFiles(resolve("e2e/fixtures/cover.png"));
    await page.locator('input[type="checkbox"][required]').check();
    await page.getByRole("button", { name: "Créer mon brouillon", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Votre brouillon est enregistré" })).toBeVisible();
    await expect(page.getByRole("main").getByRole("alert")).toContainText("La photo n’a pas été enregistrée");
    await expect(page.getByRole("button", { name: "Créer mon brouillon" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Voir mes produits" })).toHaveAttribute("href", `/vendre#produit-${PRODUCT_ID}`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`reprise-${failure}.png`), fullPage: true });
    await page.getByRole("button", { name: "Renvoyer la photo" }).click();
    await expect(page).toHaveURL(new RegExp(`/vendre#produit-${PRODUCT_ID}$`));
    expect(creations).toBe(1);
    expect(uploads).toBe(2);
  });
}

test("une erreur de création conserve les saisies et ne propose pas de renvoi de photo", async ({ page }) => {
  await connecte(page);
  await page.route("**/api/products/physical", (route) => route.request().method() === "GET"
    ? route.fulfill({ json: { categories: [
      { id: "root", slug: "maison", level: 1, label_fr: "Maison", parent_id: null },
      { id: "child", slug: "accessoires", level: 2, label_fr: "Accessoires", parent_id: "root" },
    ], models: [] } })
    : route.fulfill({ status: 400, json: { error: "Produit refusé pour cet essai" } }));
  await page.goto("/vendre/physique");
  await page.getByLabel("Titre", { exact: true }).fill("Lampe rechargeable");
  await page.getByLabel("Prix (HTG)", { exact: true }).fill("1500");
  await page.getByLabel("Quantité en stock").fill("2");
  await page.getByLabel("Catégorie", { exact: true }).selectOption("accessoires");
  await page.locator('input[type="checkbox"][required]').check();
  await page.getByRole("button", { name: "Créer mon brouillon", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText("Produit refusé pour cet essai");
  await expect(page.getByLabel("Titre", { exact: true })).toHaveValue("Lampe rechargeable");
  await expect(page.getByRole("button", { name: "Renvoyer la photo" })).toHaveCount(0);
});

for (const [lang, title] of [
  ["fr", "Un problème avec un achat ?"], ["ht", "Ou gen yon pwoblèm ak yon acha?"],
  ["en", "A problem with a purchase?"], ["es", "¿Tienes un problema con una compra?"],
]) {
  test(`l'aide achat est accessible et traduite (${lang})`, async ({ page }) => {
    await page.context().addCookies([{ name: "zabelie_lang", value: lang, domain: "127.0.0.1", path: "/" }]);
    await page.goto("/aide#probleme");
    const help = page.getByRole("region", { name: title });
    await expect(help).toBeVisible();
    await expect(help.locator('a[href="/mes-achats"]')).toBeVisible();
    await page.goto("/mes-achats");
    await expect(page.getByRole("link", { name: title })).toHaveAttribute("href", "/aide#probleme");
  });
}
