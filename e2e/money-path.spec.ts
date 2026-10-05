import { test, expect } from "@playwright/test";
import { marketplaceCopy } from "../lib/marketplace-copy";
import { t } from "../lib/i18n";

// Slug d'un produit des données d'exemple (mode démo).
const PRODUCT = "/produit/pack-presets-lightroom-afro";
const GATEWAY =
  "https://sandbox.moncashbutton.digicel.com/Moncash-middleware/Payment/Redirect?token=demo";

test.describe("Chemin de l'argent", () => {
  for (const lang of ["fr", "ht", "en", "es"] as const) test(`erreur opérateur : reprise sûre à 360 px — ${lang}`, async ({ page, context }, testInfo) => {
    await page.setViewportSize({ width: 360, height: 844 });
    await context.addCookies([{ name: "zabelie_lang", value: lang, url: "http://localhost:3000" }]);
    const labels = marketplaceCopy(lang);
    const requests: Record<string, unknown>[] = [];
    await page.route("**/api/checkout", route => {
      requests.push(route.request().postDataJSON());
      if (requests.at(-1)?.recoveryOnly === true) return route.fulfill({ status: 200, contentType: "application/json",
        body: JSON.stringify({ checkoutState: "ready", redirectUrl: GATEWAY }) });
      return route.fulfill({ status: 502, contentType: "application/json", body: JSON.stringify({ code: "provider_unavailable" }) });
    });
    await page.route("**/Moncash-middleware/**", route => route.fulfill({ status: 200, contentType: "text/html", body: "<html><body>Existing payment session</body></html>" }));
    await page.goto(PRODUCT);
    const pay = page.getByRole("button", { name: /MonCash/ });
    await pay.click();
    await expect(page.getByText(labels.paymentReview, { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: labels.resume, exact: true })).toBeVisible();
    await expect(pay).toBeDisabled();
    expect(requests).toHaveLength(1);
    expect(requests[0].checkoutKey).toMatch(/^[0-9a-f-]{36}$/);
    await page.evaluate(() => {
      for (const key of Object.keys(sessionStorage)) if (key.startsWith("zabelie:checkout-")) {
        const saved = JSON.parse(sessionStorage.getItem(key)!);
        sessionStorage.setItem(key, JSON.stringify({ ...saved, at: Date.now() - 9 * 24 * 60 * 60_000 }));
      }
    });
    await page.reload();
    // Private drafts expire, but a late reconciler cannot expire identity/review.
    await expect(page.getByRole("button", { name: /MonCash/ })).toBeDisabled();
    const resume = page.getByRole("button", { name: labels.resumeAttempt, exact: true });
    await expect(resume).toBeVisible();
    await page.evaluate(() => {
      for (const key of Object.keys(sessionStorage)) if (key.startsWith("zabelie:checkout-")) {
        const saved = JSON.parse(sessionStorage.getItem(key)!);
        sessionStorage.setItem(key, JSON.stringify({ ...saved, at: Date.now() + 60_000 }));
      }
    });
    // A clock adjustment must not forget either the nonce or the review flag.
    await page.reload();
    await expect(page.getByRole("button", { name: /MonCash/ })).toBeDisabled();
    await expect(resume).toBeVisible();
    expect((await resume.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`recovery-${lang}-360.png`), fullPage: true });
    await resume.click();
    await expect(page).toHaveURL(/Payment\/Redirect/);
    expect(requests).toHaveLength(2);
    expect(requests[1].checkoutKey).toBe(requests[0].checkoutKey);
    expect(Object.keys(requests[1]).sort()).toEqual(["checkoutKey", "productId", "recoveryOnly"]);
  });

  test("absence certaine de payment : préparation réactivée avec la même clé après reload", async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 360, height: 844 });
    const requests: Record<string, unknown>[] = [];
    await page.route("**/api/checkout", route => {
      const body = route.request().postDataJSON(); requests.push(body);
      if (requests.length === 1) return route.fulfill({ status: 503, contentType: "text/html", body: "Temporary failure" });
      if (body.recoveryOnly === true) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ checkoutState: "retryable", retryAllowed: true }) });
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ checkoutState: "ready", redirectUrl: GATEWAY }) });
    });
    await page.route("**/Moncash-middleware/**", route => route.fulfill({ status: 200, contentType: "text/html", body: "Existing order session" }));
    await page.goto(PRODUCT);
    await page.getByRole("button", { name: /MonCash/ }).click();
    await expect(page.getByRole("button", { name: /MonCash/ })).toBeDisabled();
    await page.getByRole("button", { name: "Reprendre cette tentative", exact: true }).click();
    await expect(page.getByRole("button", { name: /MonCash/ })).toBeEnabled();
    await page.screenshot({ path: testInfo.outputPath("retryable-360.png"), fullPage: true });
    await page.reload();
    await page.getByRole("button", { name: /MonCash/ }).click();
    await expect(page).toHaveURL(/Payment\/Redirect/);
    expect(requests).toHaveLength(3);
    expect(requests.every(r => r.checkoutKey === requests[0].checkoutKey)).toBe(true);
    expect(requests[2].recoveryOnly).toBeUndefined();
  });

  test("reload pendant préparation serveur : aucun nouvel achat, reprise avec même clé", async ({ page }) => {
    const requests: Record<string, unknown>[] = [];
    let releaseInitial!: () => void;
    const initialWait = new Promise<void>(resolve => { releaseInitial = resolve; });
    await page.route("**/api/checkout", async route => {
      const body = route.request().postDataJSON(); requests.push(body);
      if (!body.recoveryOnly) { await initialWait; await route.abort("failed").catch(() => {}); return; }
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ checkoutState: "pending", redirectUrl: "/paiement/en-attente?commande=11111111-1111-4111-8111-111111111111" }) });
    });
    await page.goto(PRODUCT);
    await page.getByRole("button", { name: /MonCash/ }).click();
    await expect.poll(() => requests.length).toBe(1);
    expect(await page.evaluate(() => Object.keys(sessionStorage).filter(k => k.startsWith("zabelie:checkout-review:")).map(k => JSON.parse(sessionStorage.getItem(k)!).value))).toContain(true);
    const reload = page.reload();
    releaseInitial();
    await reload;
    await expect(page.getByRole("button", { name: /MonCash/ })).toBeDisabled();
    await page.getByRole("button", { name: "Reprendre cette tentative", exact: true }).click();
    await expect(page).toHaveURL(/\/paiement\/en-attente\?commande=/);
    expect(requests).toHaveLength(2);
    expect(requests[1]).toEqual({ productId: requests[0].productId, checkoutKey: requests[0].checkoutKey, recoveryOnly: true });
  });

  test("refus avant préparation : correction autorisée, même clé de commande", async ({ page }) => {
    const requests: Record<string, unknown>[] = [];
    await page.route("**/api/checkout", route => {
      requests.push(route.request().postDataJSON());
      return route.fulfill({ status: requests.length === 1 ? 400 : 200, contentType: "application/json", body: JSON.stringify(requests.length === 1 ? { code: "recipient_invalid" } : { checkoutState: "ready", redirectUrl: GATEWAY }) });
    });
    await page.route("**/Moncash-middleware/**", route => route.fulfill({ status: 200, contentType: "text/html", body: "Same order session" }));
    await page.goto(PRODUCT);
    await page.getByRole("button", { name: /MonCash/ }).click();
    await expect(page.getByRole("button", { name: /MonCash/ })).toBeEnabled();
    await page.getByRole("button", { name: /MonCash/ }).click();
    await expect(page).toHaveURL(/Payment\/Redirect/);
    expect(requests).toHaveLength(2);
    expect(requests[1].checkoutKey).toBe(requests[0].checkoutKey);
  });

  test("tentative sans commande trouvée : nouvelle validation explicite, même clé après reload", async ({ page }) => {
    const requests: Record<string, unknown>[] = [];
    await page.route("**/api/checkout", route => {
      const body = route.request().postDataJSON(); requests.push(body);
      if (requests.length === 1) return route.abort("failed");
      if (body.recoveryOnly) return route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ code: "checkout_not_found" }) });
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ checkoutState: "ready", redirectUrl: GATEWAY }) });
    });
    await page.route("**/Moncash-middleware/**", route => route.fulfill({ status: 200, contentType: "text/html", body: "Same order session" }));
    await page.goto(PRODUCT);
    await page.getByRole("button", { name: /MonCash/ }).click();
    await page.getByRole("button", { name: "Reprendre cette tentative", exact: true }).click();
    await expect(page.getByRole("button", { name: /MonCash/ })).toBeEnabled();
    await page.reload();
    await page.getByRole("button", { name: /MonCash/ }).click();
    await expect(page).toHaveURL(/Payment\/Redirect/);
    expect(requests).toHaveLength(3);
    expect(requests.every(r => r.checkoutKey === requests[0].checkoutKey)).toBe(true);
    expect(requests[2].recoveryOnly).toBeUndefined();
  });

  test("réponse OK sans destination valide : conserve la tentative et propose la vérification", async ({ page }) => {
    await page.route("**/api/checkout", route => route.fulfill({ status: 200, contentType: "application/json", body: "null" }));
    await page.goto(PRODUCT);
    await page.getByRole("button", { name: /MonCash/ }).click();
    await expect(page).toHaveURL(new RegExp(PRODUCT + "$"));
    await expect(page.getByRole("button", { name: /MonCash/ })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Reprendre cette tentative", exact: true })).toBeEnabled();
  });

  test("409 tentative historique en conflit : vérification seule, aucun nouveau paiement proposé", async ({ page }) => {
    const requests: Record<string, unknown>[] = [];
    await page.route("**/api/checkout", route => {
      const body = route.request().postDataJSON(); requests.push(body);
      return route.fulfill({ status: body.recoveryOnly ? 200 : 409, contentType: "application/json", body: JSON.stringify(body.recoveryOnly ? { checkoutState: "review", redirectUrl: "/mes-achats" } : { code: "checkout_attempt_conflict" }) });
    });
    await page.goto(PRODUCT);
    await page.getByRole("button", { name: /MonCash/ }).click();
    await expect(page.getByRole("button", { name: /MonCash/ })).toBeDisabled();
    await page.getByRole("button", { name: "Reprendre cette tentative", exact: true }).click();
    await expect(page).toHaveURL(/\/mes-achats$/);
    expect(requests).toHaveLength(2);
    expect(requests[1].checkoutKey).toBe(requests[0].checkoutKey);
    expect(requests[1].recoveryOnly).toBe(true);
  });

  test("commande encore incertaine : vérification sans nouveau paiement et clé conservée", async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const requests: Record<string, unknown>[] = [];
    const orderId = "11111111-1111-4111-8111-111111111111";
    await page.route("**/api/checkout", route => {
      const body = route.request().postDataJSON(); requests.push(body);
      if (!body.recoveryOnly) return route.abort("failed");
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ orderId, checkoutState: "pending", redirectUrl: `/paiement/en-attente?commande=${orderId}` }) });
    });
    await page.goto(PRODUCT);
    await page.getByRole("button", { name: /MonCash/ }).click();
    await page.getByRole("button", { name: "Reprendre cette tentative", exact: true }).click();
    await expect(page).toHaveURL(/\/paiement\/en-attente\?commande=/);
    expect(requests).toHaveLength(2);
    const key = requests[0].checkoutKey;
    expect(await page.evaluate(() => Object.keys(sessionStorage).filter(k => k.startsWith("zabelie:checkout-attempt:")).map(k => JSON.parse(sessionStorage.getItem(k)!).key))).toContain(key);
    await page.getByRole("button", { name: "Reprendre cette tentative", exact: true }).click();
    await expect(page.getByRole("status").getByText(marketplaceCopy("fr").paymentPending, { exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("pending-1440.png"), fullPage: true });
    expect(requests).toHaveLength(3);
    expect(requests[2]).toEqual({ orderId, recoveryOnly: true });
  });

  test("commande terminée : reprise vers les achats et nettoyage contrôlé de la clé", async ({ page }) => {
    await page.route("**/api/checkout", route => route.fulfill({ status: route.request().postDataJSON().recoveryOnly ? 200 : 502,
      contentType: "application/json", body: JSON.stringify(route.request().postDataJSON().recoveryOnly ? { checkoutState: "complete", redirectUrl: "/mes-achats" } : { code: "provider_unavailable" }) }));
    await page.goto(PRODUCT);
    await page.getByRole("button", { name: /MonCash/ }).click();
    await page.getByRole("button", { name: "Reprendre cette tentative", exact: true }).click();
    await expect(page).toHaveURL(/\/mes-achats$/);
    expect(await page.evaluate(() => Object.keys(sessionStorage).filter(k => k.startsWith("zabelie:checkout-attempt:")))).toEqual([]);
  });

  test("retour de passerelle : document conservé, reprise disponible et achat verrouillé", async ({ page }) => {
    const requests: Record<string, unknown>[] = [];
    await page.route("**/api/checkout", route => {
      requests.push(route.request().postDataJSON());
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ checkoutState: "ready", redirectUrl: GATEWAY }) });
    });
    await page.route("**/Moncash-middleware/**", route => route.fulfill({ status: 200, contentType: "text/html", body: "Existing order session" }));
    await page.goto(PRODUCT);
    await page.getByRole("button", { name: /MonCash/ }).click();
    await expect(page).toHaveURL(/Payment\/Redirect/);
    await page.goBack({ waitUntil: "load" });
    await expect(page.getByRole("button", { name: /MonCash/ })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Reprendre cette tentative", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "Reprendre cette tentative", exact: true }).click();
    await expect(page).toHaveURL(/Payment\/Redirect/);
    expect(requests).toHaveLength(2);
    expect(requests[1].recoveryOnly).toBe(true);
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

  for (const lang of ["fr", "ht", "en", "es"] as const) test(`page en attente : vérification sans promesse de délai — ${lang}`, async ({ page, context }) => {
    await page.setViewportSize({ width: 360, height: 844 });
    await context.addCookies([{ name: "zabelie_lang", value: lang, url: "http://localhost:3000" }]);
    await page.goto("/paiement/en-attente");
    await expect(page.getByText(t(lang, "pay.wait.body"), { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
});
