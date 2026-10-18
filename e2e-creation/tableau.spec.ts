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

/**
 * Phase T2 — l'accueil façon Chariow. Les chiffres attendus se recalculent à la
 * main depuis le jeu de test du faux Supabase (`PRODUITS_VENDUS`) : 10 ventes à
 * 8 acheteurs ; revenus nets 5 × 1 425 + 3 × 712 + 2 × 950 = 11 161 HTG ;
 * sur sept jours 3 × 1 425 + 712 + 950 = 5 937 HTG.
 */
test("accueil façon Chariow : salutation, actions, chiffres réels, classement, montants masquables", async ({ page, request }) => {
  await request.get(`${STUB}/__ventes?mode=pleines`);
  await page.setViewportSize({ width: 1280, height: 900 });
  await connecte(page, "fr");
  await expect(page.getByRole("heading", { level: 1, name: /^(Bonjour|Bonsoir), Vandè$/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "Voir ma boutique" })).toHaveAttribute("href", /^\/(boutik|createur)\//);
  const actions = page.getByRole("list", { name: "Que voulez-vous faire aujourd’hui ?" });
  for (const nom of ["Créer un produit digital", "Partir d’un modèle", "Analyser un marché", "Créer un code promo"]) {
    await expect(actions.getByRole("link", { name: nom })).toBeVisible();
  }
  await expect(actions.getByRole("link", { name: "Créer un code promo" })).toHaveAttribute("href", "/tableau-de-bord#codes-promo");

  const chiffres = page.getByRole("region", { name: "Vos ventes de produits digitaux" });
  await expect(chiffres).toContainText(/11\s161 HTG/);
  await expect(chiffres).toContainText(/5\s937 HTG/);
  await expect(chiffres).toContainText("10 ventes au total");
  const meilleurs = chiffres.locator("ol > li"); // le classement, pas les cartes
  await expect(meilleurs.first()).toContainText("Lanse yon biznis sou entènèt");
  await expect(meilleurs.first()).toContainText("5 ventes");
  await expect(chiffres.getByRole("link", { name: "Voir toutes les ventes" })).toHaveAttribute("href", "/mes-ventes");
  // Avec des ventes, les chiffres passent avant les projets.
  const avant = await page.evaluate(() => {
    const a = document.getElementById("chiffres-titre");
    const b = document.getElementById("mes-projets");
    return !!a && !!b && !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
  });
  expect(avant).toBe(true);

  // Masquer : les montants deviennent des points, la préférence survit au rechargement.
  const bascule = chiffres.getByRole("button", { name: "Masquer les montants" });
  await expect(bascule).toHaveAttribute("aria-pressed", "false");
  await bascule.click();
  await expect(bascule).toHaveAttribute("aria-pressed", "true");
  await expect(chiffres.getByText(/11\s161 HTG/)).toBeHidden();
  await expect(chiffres.getByText("•••••").first()).toBeVisible();
  await page.reload();
  await expect(chiffres.getByRole("button", { name: "Masquer les montants" })).toHaveAttribute("aria-pressed", "true");
  await expect(chiffres.getByText(/11\s161 HTG/)).toBeHidden();
  await chiffres.getByRole("button", { name: "Masquer les montants" }).click();
  await expect(chiffres.getByText(/11\s161 HTG/)).toBeVisible();

  // Le menu sort vers des pages vendeur qui existent.
  const menu = page.getByRole("navigation", { name: "Menu du Studio" });
  await expect(menu.getByRole("link", { name: "Mes ventes" })).toHaveAttribute("href", "/mes-ventes");
  await expect(menu.getByRole("link", { name: "Centre d'aide" })).toHaveAttribute("href", "/aide");
});

test("sans vente : les projets d'abord, un état vide honnête, pas d'action promo", async ({ page }) => {
  await connecte(page, "ht");
  const chiffres = page.getByRole("region", { name: "Vant pwodwi dijital ou yo" });
  await expect(chiffres).toContainText("Poko gen vant.");
  await expect(chiffres.getByRole("link", { name: "Gade tout vant yo" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Kreye yon kòd pwomo" })).toHaveCount(0);
  const apres = await page.evaluate(() => {
    const a = document.getElementById("chiffres-titre");
    const b = document.getElementById("mes-projets");
    return !!a && !!b && !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_PRECEDING);
  });
  expect(apres).toBe(true);
});

test("lecture impossible : l'écran le dit, il n'affiche pas zéro", async ({ page, request }) => {
  await request.get(`${STUB}/__ventes?mode=erreur`);
  await connecte(page, "fr");
  const chiffres = page.getByRole("region", { name: "Vos ventes de produits digitaux" });
  await expect(chiffres.getByRole("status")).toHaveText("Vos chiffres n'ont pas pu être lus. Rechargez la page dans un instant.");
  await expect(chiffres).not.toContainText("HTG");
});

test("accueil rempli à 360 px : rien ne déborde", async ({ page, request }) => {
  await request.get(`${STUB}/__ventes?mode=pleines`);
  await page.setViewportSize({ width: 360, height: 780 });
  await connecte(page, "ht");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
});
