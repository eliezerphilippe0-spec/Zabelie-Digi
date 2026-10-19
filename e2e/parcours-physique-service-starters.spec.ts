import { test, expect } from "@playwright/test";

test("a seller receives actual service model buttons tied to active categories", async ({ request }) => {
  const session = { access_token: "vendeur-preparation-services", refresh_token: "test", token_type: "bearer", expires_at: 4102444800, expires_in: 3600, user: { id: "22222222-2222-2222-2222-222222222222", aud: "authenticated", role: "authenticated" } };
  const token = "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url");
  const headers = { Cookie: `sb-127-auth-token=${token}; zabelie_lang=fr` };
  // Le formulaire ne s'ouvre qu'une fois le type choisi (2026-10-18) : « Service » ici.
  const res = await request.get("/vendre?nouveau=prestation", { headers });
  expect(res.ok()).toBe(true);
  const html = await res.text();
  for (const title of ["10 visuels pour mon commerce", "Diagnostic téléphone ou ordinateur", "Diagnostic solaire ou onduleur"]) {
    expect(html).toMatch(new RegExp(`<button[^>]*>${title}</button>`));
  }
  expect(html).toMatch(/<option value="Digital &amp; services"/);
  // Sans choix, la page ne montre que le choix du type.
  const nu = await (await request.get("/vendre", { headers })).text();
  expect(nu).toContain('id="nouveau"');
  expect(nu).not.toMatch(/<button[^>]*>Diagnostic téléphone ou ordinateur<\/button>/);
});

test("the service guide is rendered in Creole and remains scoped to services", async ({ request }) => {
  const service = await request.get("/catalogue?univers=services", { headers: { Cookie: "zabelie_lang=ht" } });
  expect(service.ok()).toBe(true);
  const html = await service.text();
  expect(html).toContain('aria-labelledby="service-buying-guide"');
  expect(html).toContain("Prepare sèvis ou anvan ou peye");
  expect(html).toContain("mande pri reparasyon ak pyès separeman");
  for (const universe of ["objets", "numerique"]) {
    const res = await request.get(`/catalogue?univers=${universe}`);
    expect(res.ok()).toBe(true);
    expect(await res.text()).not.toContain('aria-labelledby="service-buying-guide"');
  }
});

test("a service model sets the scope without carrying over price or deadline", async ({ page }) => {
  const session = { access_token: "vendeur-preparation-services", refresh_token: "test", token_type: "bearer", expires_at: 4102444800, expires_in: 3600, user: { id: "22222222-2222-2222-2222-222222222222", aud: "authenticated", role: "authenticated" } };
  await page.context().addCookies([
    { name: "sb-127-auth-token", value: "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url"), domain: "127.0.0.1", path: "/" },
    { name: "zabelie_lang", value: "fr", domain: "127.0.0.1", path: "/" },
  ]);
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/vendre");
  // « Nouveau produit » demande le type d'abord (2026-10-18) : le choix « Service » ouvre le formulaire, type déjà choisi.
  await page.locator("#nouveau").getByRole("link", { name: /^Service\b/ }).click();
  await expect(page).toHaveURL(/\/vendre\?nouveau=prestation#nouveau$/);
  const starter = page.getByRole("button", { name: "Diagnostic téléphone ou ordinateur", exact: true });
  await starter.click();
  await expect(page.getByRole("textbox", { name: "Titre du produit", exact: true })).toHaveValue("Diagnostic téléphone ou ordinateur");
  await expect(page.getByRole("combobox", { name: "Type de produit", exact: true })).toHaveValue("service");
  await expect(page.getByRole("combobox", { name: "Sous-rayon (facultatif)", exact: true })).toHaveValue("services-repair");
  const price = page.getByRole("spinbutton", { name: "Prix (HTG)", exact: true });
  const deadline = page.getByRole("spinbutton", { name: "Délai de livraison en jours (0 = le jour même)", exact: true });
  await price.fill("2500"); await deadline.fill("2");
  page.once("dialog", dialog => dialog.dismiss());
  await page.getByRole("button", { name: "10 visuels pour mon commerce", exact: true }).click();
  await expect(price).toHaveValue("2500");
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "10 visuels pour mon commerce", exact: true }).click();
  await expect(price).toHaveValue(""); await expect(deadline).toHaveValue("");
  await expect(page.getByRole("combobox", { name: "Sous-rayon (facultatif)", exact: true })).toHaveValue("services-design");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
