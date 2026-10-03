import { test, expect, type Page } from "@playwright/test";

/**
 * Clés d'API vendeur (0121) — le parcours écran, contre le stub Supabase :
 * créer une clé, la voir UNE fois, la retrouver dans la liste par son seul
 * préfixe, la révoquer.
 */
async function connecte(page: Page) {
  const session = {
    access_token: "cles-api", refresh_token: "rafraichissement-de-test", token_type: "bearer",
    expires_in: 3600, expires_at: 4102444800,
    user: { id: "11111111-1111-1111-1111-111111111111", aud: "authenticated", role: "authenticated", email: "achte@example.ht", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" },
  };
  const value = "base64-" + Buffer.from(JSON.stringify(session), "utf8").toString("base64url");
  await page.context().addCookies([{ name: "sb-127-auth-token", value, domain: "127.0.0.1", path: "/" }]);
}

test("une clé se crée, ne s'affiche qu'une fois, puis se révoque", async ({ page }) => {
  await connecte(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/tableau-de-bord/api", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  await page.locator("main form").first().locator("input").fill("Mon site e2e");
  await page.locator("main form").first().locator("button[type=submit]").click();

  const affichee = page.locator('[role="status"] code');
  await expect(affichee).toHaveText(/^zb_live_[A-Za-z0-9_-]{43}$/);
  const cle = (await affichee.textContent())!;

  // La liste ne porte que le PRÉFIXE, jamais la clé entière.
  const ligne = page.locator("main li", { hasText: "Mon site e2e" });
  await expect(ligne).toContainText(cle.slice(0, 14));
  expect(await page.locator("main ul").first().innerText()).not.toContain(cle);

  // Une fois masquée, la clé n'est plus nulle part dans la page.
  await page.locator('[role="status"] button').last().click();
  await expect(page.locator('[role="status"]')).toHaveCount(0);
  expect(await page.content()).not.toContain(cle);

  page.once("dialog", (d) => d.accept());
  await ligne.getByRole("button").click();
  await expect(ligne.getByRole("button")).toHaveCount(0);

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("l'API vendeur répond à une clé valide, et plus du tout une fois révoquée", async ({ page, request }) => {
  await connecte(page);
  await page.goto("/tableau-de-bord/api", { waitUntil: "networkidle" });
  const creee = await page.request.post("/api/account/api-keys", { data: { name: "Intégration e2e" } });
  expect(creee.status()).toBe(201);
  const { key, id } = await creee.json();
  expect(key).toMatch(/^zb_live_[A-Za-z0-9_-]{43}$/);

  // Une requête SANS cookie, comme un serveur tiers : seule la clé compte.
  const api = request;
  const appel = (nom: string, corps: unknown, cle?: string) =>
    api.post(`/api/v1/seller/${nom}`, { data: corps, headers: cle ? { Authorization: `Bearer ${cle}` } : {} });

  const produits = await appel("seller_products", { limit: 5 }, key);
  expect(produits.status()).toBe(200);
  const corps = await produits.json();
  expect(corps.type).toBe("seller_products");
  expect(Array.isArray(corps.results)).toBe(true);
  expect(produits.headers()["access-control-allow-origin"]).toBeUndefined();

  expect((await appel("seller_products", {})).status()).toBe(401);
  // Les quatre langues : la réponse suit Accept-Language, puis ?lang=.
  for (const [l, attendu] of [["ht", "Kle API a manke"], ["en", "API key missing"], ["es", "Clave de API ausente"], ["fr", "Clé d'API absente"]] as const) {
    const r = await api.post("/api/v1/seller/seller_products", { data: {}, headers: { "Accept-Language": l } });
    expect(r.headers()["content-language"]).toBe(l);
    expect((await r.json()).message).toContain(attendu);
  }
  const contrat = await (await api.get("/api/v1/seller/openapi.json?lang=ht")).json();
  expect(contrat.info.title).toBe("Zabelie — API vandè");
  expect((await appel("seller_products", {}, "zb_live_" + "x".repeat(43))).status()).toBe(401);
  expect((await appel("seller_products", { limit: 500 }, key)).status()).toBe(400);
  expect((await appel("create_product_link", { productId: "99999999-9999-4999-8999-999999999999" }, key)).status()).toBe(404);
  expect((await appel("inconnu", {}, key)).status()).toBe(404);

  expect((await page.request.delete(`/api/account/api-keys/${id}`)).status()).toBe(200);
  expect((await appel("seller_products", { limit: 5 }, key)).status()).toBe(401);
});

test("un point webhook s'ajoute (secret affiché une fois), refuse le http, se désactive", async ({ page }) => {
  await connecte(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/tableau-de-bord/api#webhooks", { waitUntil: "networkidle" });
  const formulaire = page.locator("main form").last();

  // L'API refuse le http : on l'appelle directement (le champ `type=url` du navigateur bloquerait avant).
  const refus = await page.request.post("/api/account/webhooks", { data: { url: "http://boutik.example/h" } });
  expect(refus.status()).toBe(422);
  expect((await page.request.post("/api/account/webhooks", { data: { url: "https://127.0.0.1/h" } })).status()).toBe(422);

  await formulaire.locator("input").fill("https://boutik.example/hooks/zabelie");
  await formulaire.locator("button[type=submit]").click();
  const secret = page.locator('[role="status"] code');
  await expect(secret).toHaveText(/^whsec_[A-Za-z0-9_-]{43}$/);
  const valeur = (await secret.textContent())!;

  const ligne = page.locator("main li", { hasText: "https://boutik.example/hooks/zabelie" });
  await expect(ligne).toBeVisible();
  await page.locator('[role="status"] button').last().click();
  expect(await page.content()).not.toContain(valeur);

  page.once("dialog", (d) => d.accept());
  await ligne.getByRole("button").last().click();
  await expect(ligne.getByRole("button")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
