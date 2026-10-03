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

  await page.locator("main form input").fill("Mon site e2e");
  await page.locator("main form button[type=submit]").click();

  const affichee = page.locator('[role="status"] code');
  await expect(affichee).toHaveText(/^zb_live_[A-Za-z0-9_-]{43}$/);
  const cle = (await affichee.textContent())!;

  // La liste ne porte que le PRÉFIXE, jamais la clé entière.
  const ligne = page.locator("main li", { hasText: "Mon site e2e" });
  await expect(ligne).toContainText(cle.slice(0, 14));
  expect(await page.locator("main ul").innerText()).not.toContain(cle);

  // Une fois masquée, la clé n'est plus nulle part dans la page.
  await page.locator('[role="status"] button').last().click();
  await expect(page.locator('[role="status"]')).toHaveCount(0);
  expect(await page.content()).not.toContain(cle);

  page.once("dialog", (d) => d.accept());
  await ligne.getByRole("button").click();
  await expect(ligne.getByRole("button")).toHaveCount(0);

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
