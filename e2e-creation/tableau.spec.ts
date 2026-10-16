import { test, expect, type Page } from "@playwright/test";

/**
 * Studio de création éditoriale — le tableau (tasks/plan.md, phase T).
 * Contre `e2e/fixtures/stub-creation.mjs` : les opportunités y sont un jeu
 * de TEST au format exact de `zabelie_authoring_opportunites()` (0143).
 */
const STUB = "http://127.0.0.1:15431";

test.beforeEach(async ({ request }) => {
  await request.get(`${STUB}/__reset`);
});

async function connecte(page: Page, lang: string, suite = "/tableau-de-bord/creation") {
  await page.goto(`${STUB}/__login?role=seller&lang=${lang}&next=${encodeURIComponent(suite)}`);
}

test("opportunités : aperçu sur le tableau, analyse détaillée, guide créé depuis une recherche", async ({ page }) => {
  await connecte(page, "ht");
  const opp = page.getByRole("region", { name: "Opòtinite pou ou" });
  await expect(opp).toContainText("« aprann angle » : 23 moun chèche l san yo pa jwenn anyen");
  await expect(opp.getByRole("listitem")).toHaveCount(3); // un aperçu, pas la liste entière

  await opp.getByRole("link", { name: /Gade analiz la/ }).click();
  await expect(page).toHaveURL(/\/tableau-de-bord\/creation\/analyse$/);
  await expect(page.getByRole("heading", { level: 1, name: "Analize yon mache" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Analize yon mache", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByText("Pwodwi dijital", { exact: true })).toBeVisible();
  await expect(page.getByText(/omwen 5 moun diferan .* omwen 3 vant .* omwen 2 vandè diferan/)).toBeVisible();

  await page.getByRole("link", { name: "Kreye yon gid sou sa" }).first().click();
  await expect(page).toHaveURL(/depart=vide/);
  await expect(page.getByRole("textbox", { name: "Tit travay la" })).toHaveValue("Aprann angle");
  await page.getByRole("button", { name: "Kreye pwojè a" }).click();
  await expect(page).toHaveURL(/\/tableau-de-bord\/creation\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1, name: "Aprann angle" })).toBeVisible();
});

test("pas assez de données : un état vide honnête, jamais un chiffre inventé", async ({ page, request }) => {
  await request.get(`${STUB}/__opportunites?mode=vide`);
  await connecte(page, "fr");
  const opp = page.getByRole("region", { name: "Opportunités pour vous" });
  await expect(opp).toContainText("Pas encore assez de données.");
  await expect(opp.getByRole("listitem")).toHaveCount(0);
  await page.goto("/tableau-de-bord/creation/analyse");
  await expect(page.getByText("Pas encore assez de données.", { exact: false })).toHaveCount(2);
  await expect(page.getByRole("link", { name: "Créer un guide sur ce sujet" })).toHaveCount(0);
});

test("menu : à gauche sur ordinateur, en onglets sur téléphone, sans défilement horizontal", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await connecte(page, "fr");
  const menu = page.getByRole("navigation", { name: "Menu du Studio" });
  await expect(menu.getByRole("link", { name: "Accueil" })).toHaveAttribute("aria-current", "page");
  const boite = await menu.boundingBox();
  expect(boite && boite.x < 300).toBeTruthy(); // colonne de gauche

  await page.setViewportSize({ width: 360, height: 780 });
  await page.reload();
  for (const url of ["/tableau-de-bord/creation", "/tableau-de-bord/creation/analyse", "/tableau-de-bord/creation?depart=modele"]) {
    await page.goto(url);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  }
});
