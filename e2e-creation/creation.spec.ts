import { test, expect, type Page } from "@playwright/test";

/**
 * Studio de création éditoriale (docs/70, tâches 2.3 et 2.4) — parcours réel
 * dans un navigateur, contre `e2e/fixtures/stub-creation.mjs`.
 */
const STUB = "http://127.0.0.1:15431";

async function connecte(page: Page, role: "seller" | "other", lang: string, suite = "/tableau-de-bord/creation?depart=vide") {
  await page.goto(`${STUB}/__login?role=${role}&lang=${lang}&next=${encodeURIComponent(suite)}`);
}

test.beforeEach(async ({ request }) => {
  await request.get(`${STUB}/__reset`);
});

test("un guide en kreyòl naît d'un modèle, son plan s'approuve, sa rédaction se retrouve après rechargement", async ({ page }) => {
  await connecte(page, "seller", "ht", "/tableau-de-bord/creation");
  await expect(page.getByRole("heading", { level: 1, name: "Kisa ou vle fè jodi a ?" })).toBeVisible();
  await expect(page.getByText("Bonjou, Vandè.")).toBeVisible();
  await expect(page.getByRole("link", { name: /Analize yon mache/ }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /Kreye yon pwodui dijital/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /piblisite/i })).toHaveCount(0); // publicités abandonnées
  await expect(page.locator("#nouveau-projet")).toHaveCount(0); // le formulaire vient après un choix

  await page.getByRole("link", { name: /Kòmanse ak yon modèl/ }).click();
  await expect(page.getByRole("combobox", { name: "Modèl" })).toHaveValue("activite");
  await expect(page.getByText("Egz. : Lanse boutik ou sou entènèt nan 30 jou").first()).toBeVisible();
  // Audio et vidéo annoncés, jamais proposés.
  await expect(page.locator("main").getByText("Talè konsa")).toHaveCount(3);
  await expect(page.getByRole("link", { name: /Pake odyo|Fòmasyon videyo/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Pake odyo|Fòmasyon videyo/ })).toHaveCount(0);
  await page.getByRole("textbox", { name: "Tit travay la" }).fill("Lanse boutik mwen sou entènèt");
  await page.getByRole("button", { name: "Kreye pwojè a" }).click();
  await expect(page).toHaveURL(/\/tableau-de-bord\/creation\/[0-9a-f-]{36}$/);

  await expect(page.getByRole("textbox", { name: "1. Tit seksyon an" })).toHaveValue("Poukisa aktivite sa a ka mache");
  await expect(page.getByText("Apwouve plan an anvan pou w kòmanse ekri.")).toBeVisible();

  for (const [champ, valeur] of [
    ["Sijè gid la", "Vann sou entènèt"], ["Pou ki moun egzakteman", "Machann nan mache Okap"], ["Pwoblèm gid la rezoud", "Yo pa konn kote pou yo kòmanse"],
    ["Sa lektè a ap konn fè lè li fini", "Louvri yon boutik sou Zabelie"], ["Eksperyans ou oswa metòd ou", "Senk lane ap vann sou WhatsApp"],
  ]) await page.getByRole("textbox", { name: champ, exact: true }).fill(valeur);
  await page.getByRole("button", { name: "Apwouve plan an" }).click();
  await expect(page.getByText("Plan an apwouve")).toBeVisible();

  const corps = page.getByRole("textbox", { name: "Tèks seksyon an : Poukisa aktivite sa a ka mache" });
  await corps.fill("Moun ap chèche achte san yo pa deplase.");
  await page.getByRole("button", { name: "Anrejistre" }).click();
  await expect(page.getByRole("status").filter({ hasText: /^✓ Li anrejistre$/ })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("textbox", { name: "Tèks seksyon an : Poukisa aktivite sa a ka mache" })).toHaveValue("Moun ap chèche achte san yo pa deplase.");
  await expect(page.getByRole("textbox", { name: "Sijè gid la", exact: true })).toHaveValue("Vann sou entènèt");
});

test("deux onglets sur le même projet : conflit explicite, rien d'écrasé, le vendeur choisit sa version", async ({ page, context }) => {
  await connecte(page, "seller", "fr");
  await page.getByRole("textbox", { name: "Titre de travail" }).fill("Guide des démarches");
  await page.getByRole("button", { name: "Créer le projet" }).click();
  await expect(page).toHaveURL(/\/tableau-de-bord\/creation\/[0-9a-f-]{36}$/);
  const url = page.url();

  const autre = await context.newPage();
  await autre.goto(url);

  await page.getByRole("textbox", { name: "Titre de travail" }).fill("Version de l’onglet A");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByRole("status").filter({ hasText: /^✓ Enregistré$/ })).toBeVisible();

  await autre.getByRole("textbox", { name: "Titre de travail" }).fill("Version de l’onglet B");
  await autre.getByRole("button", { name: "Enregistrer" }).click();
  // Next.js pose aussi un `role="alert"` (annonceur de route) : on vise le nôtre.
  const alerte = autre.getByRole("alert").filter({ hasText: "modifié ailleurs" });
  await expect(alerte).toBeVisible();
  await expect(autre.getByRole("textbox", { name: "Titre de travail" })).toHaveValue("Version de l’onglet B");

  await alerte.getByRole("button", { name: "Garder ma version" }).click();
  await expect(autre.getByRole("status").filter({ hasText: /^✓ Enregistré$/ })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Titre de travail" })).toHaveValue("Version de l’onglet B");
});

test("le projet d'un autre vendeur est introuvable", async ({ page, browser }) => {
  await connecte(page, "seller", "fr");
  await page.getByRole("textbox", { name: "Titre de travail" }).fill("Mon guide privé");
  await page.getByRole("button", { name: "Créer le projet" }).click();
  await expect(page).toHaveURL(/\/tableau-de-bord\/creation\/[0-9a-f-]{36}$/);
  const url = new URL(page.url()).pathname;

  const etranger = await (await browser.newContext()).newPage();
  await connecte(etranger, "other", "fr", url);
  // L'écran « introuvable », jamais le projet. Le statut HTTP reste 200 : le
  // `app/loading.tsx` racine ouvre le streaming avant le `notFound()`. L'API,
  // elle, rend 404 (tests/digital-authoring-api-projets.test.ts).
  await expect(etranger.getByRole("heading", { level: 1, name: "Cette page n'existe pas" })).toBeVisible();
  await expect(etranger.getByText("Mon guide privé")).toHaveCount(0);
  const api = await etranger.request.get(`/api/digital-authoring/projects/${url.split("/").pop()}`);
  expect(api.status()).toBe(404);
});

for (const lang of ["ht", "fr", "en", "es"]) {
  test(`360 px en ${lang} : accueil et éditeur sans défilement horizontal`, async ({ page }, info) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await connecte(page, "seller", lang);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const largeur = () => page.evaluate(() => document.documentElement.scrollWidth);
    expect(await largeur()).toBeLessThanOrEqual(360);
    await page.screenshot({ path: info.outputPath(`accueil-${lang}-360.png`), fullPage: true });

    const formulaire = page.locator("#nouveau-projet form");
    await formulaire.getByRole("textbox").first().fill("Gid tès 360");
    await formulaire.locator("button[type=submit]").click();
    await expect(page).toHaveURL(/\/tableau-de-bord\/creation\/[0-9a-f-]{36}$/);
    expect(await largeur()).toBeLessThanOrEqual(360);
    await page.screenshot({ path: info.outputPath(`editeur-${lang}-360.png`), fullPage: true });
  });
}
