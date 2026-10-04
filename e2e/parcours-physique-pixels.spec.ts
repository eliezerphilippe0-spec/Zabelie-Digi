import { test, expect, type Page } from "@playwright/test";

/**
 * Pixels vendeur (0123) : RIEN ne part vers une régie avant le consentement ;
 * un refus est retenu ; un accord charge les seules régies configurées.
 * Les régies sont interceptées (aucune requête ne sort du test).
 */
async function intercepter(page: Page) {
  const appels: string[] = [];
  await page.route(/connect\.facebook\.net|googletagmanager\.com|analytics\.tiktok\.com|google-analytics\.com|facebook\.com\/tr/, (route) => {
    appels.push(route.request().url());
    return route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
  });
  return appels;
}

test("aucun pixel avant consentement ; le refus est retenu", async ({ page }) => {
  const appels = await intercepter(page);
  const r = await page.goto("/produit/pixel-test", { waitUntil: "networkidle" });
  expect(r?.headers()["content-security-policy"]).toContain("https://connect.facebook.net");
  const bandeau = page.locator("[data-bandeau-pixels]");
  await expect(bandeau).toBeVisible();
  expect(appels).toEqual([]);

  await bandeau.getByRole("button").first().click(); // Refuser
  await expect(bandeau).toHaveCount(0);
  expect((await page.context().cookies()).find((c) => c.name === "zab_pub")?.value).toBe("0");
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.locator("[data-bandeau-pixels]")).toHaveCount(0);
  expect(appels, "un refus ne charge rien, même après rechargement").toEqual([]);
});

test("l'accord charge Meta et Google (configurés), pas TikTok ; ViewContent part avec le prix", async ({ page }) => {
  const appels = await intercepter(page);
  await page.goto("/produit/pixel-test", { waitUntil: "networkidle" });
  await page.locator("[data-bandeau-pixels]").getByRole("button").last().click(); // Accepter
  await expect.poll(() => appels.length).toBeGreaterThanOrEqual(2);
  expect(appels.some((u) => u.includes("connect.facebook.net/en_US/fbevents.js"))).toBe(true);
  expect(appels.some((u) => u.includes("googletagmanager.com/gtag/js?id=G-AB12CD34EF"))).toBe(true);
  expect(appels.some((u) => u.includes("tiktok"))).toBe(false);
  const evenements = await page.evaluate(() => ((window as unknown as { fbq: { queue: unknown[][] } }).fbq.queue).map((a) => a[1]));
  expect(evenements).toEqual(["123456789012345", "PageView", "ViewContent"]);
});

test("hors des pages vendeur : ni bandeau, ni domaines de régie dans la CSP", async ({ page }) => {
  const r = await page.goto("/catalogue", { waitUntil: "networkidle" });
  expect(r?.headers()["content-security-policy"]).not.toContain("facebook");
  await expect(page.locator("[data-bandeau-pixels]")).toHaveCount(0);
  const p = await page.goto("/produit/" + "kit-depart", { waitUntil: "networkidle" });
  expect(p?.status()).toBeLessThan(500);
  await expect(page.locator("[data-bandeau-pixels]"), "un vendeur sans pixel n'affiche aucun bandeau").toHaveCount(0);
});

test("« Gérer les traceurs » : depuis le pied de page, l'accord se retire en un clic et efface les cookies des régies", async ({ page, context, baseURL }) => {
  const url = baseURL!;
  await context.addCookies([
    { name: "zab_pub", value: "1", url },
    { name: "_fbp", value: "fb.1.test", url },
  ]);
  await page.goto("/catalogue");
  await page.locator('footer a[href="/confidentialite#traceurs"]').click();
  await expect(page).toHaveURL(/\/confidentialite#traceurs$/);
  const centre = page.locator("[data-preferences-traceurs]");
  await expect(centre.locator("[data-etat]")).toHaveAttribute("data-etat", "oui");
  await centre.getByRole("button").first().click(); // Refuser
  await expect(centre.locator("[data-etat]")).toHaveAttribute("data-etat", "non");
  const cookies = await context.cookies();
  expect(cookies.find((c) => c.name === "zab_pub")?.value).toBe("0");
  expect(cookies.find((c) => c.name === "_fbp"), "le refus efface l'identifiant Meta déjà posé").toBeUndefined();

  const appels = await intercepter(page);
  await page.goto("/produit/pixel-test", { waitUntil: "networkidle" });
  await expect(page.locator("[data-bandeau-pixels]")).toHaveCount(0);
  expect(appels).toEqual([]);
});

test("relances : la page de désabonnement ne coupe rien seule, et parle kreyòl", async ({ page, context, baseURL }) => {
  await context.addCookies([{ name: "zabelie_lang", value: "ht", url: baseURL! }]);
  const jeton = "0b6b4c1e-8a4e-4d0b-9f43-2a1c3d4e5f60";
  await page.goto(`/desabonnement/${jeton}`);
  const form = page.locator('main form[action="/api/desabonnement"]');
  await expect(form).toHaveAttribute("method", "post");
  await expect(form.locator('input[name="jeton"]')).toHaveValue(jeton);
  await expect(form.getByRole("button")).toHaveText("Kanpe rapèl yo");
  const get = await page.request.get(`/api/desabonnement?jeton=${jeton}`);
  expect(get.status(), "un GET (scanner de liens) ne désabonne pas").toBe(405);
});
