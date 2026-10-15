import { test, expect, type Page } from "@playwright/test";

/**
 * Studio de création éditoriale — sauvegarde robuste (docs/70, tâche 2.5 ;
 * PRD STU 05, T14 à T16). Contre `e2e/fixtures/stub-creation.mjs`.
 */
const STUB = "http://127.0.0.1:15431";
const VENDEUR = "11400000-0000-4000-8000-000000000001";
const PREFIXE = "zabelie:creation:v1:";

async function connecte(page: Page, role: "seller" | "other" = "seller", suite = "/tableau-de-bord/creation") {
  await page.goto(`${STUB}/__login?role=${role}&lang=fr&next=${encodeURIComponent(suite)}`);
}
async function nouveauProjet(page: Page, titre = "Guide de test"): Promise<string> {
  await connecte(page);
  await page.getByRole("textbox", { name: "Titre de travail" }).fill(titre);
  await page.getByRole("button", { name: "Créer le projet" }).click();
  await expect(page).toHaveURL(/\/tableau-de-bord\/creation\/[0-9a-f-]{36}$/);
  return page.url();
}
const sujet = (page: Page) => page.getByRole("textbox", { name: "Sujet du guide", exact: true });
const etat = (page: Page, texte: string | RegExp) => page.getByRole("status").filter({ hasText: texte });
/** EXACT : un filtre en texte ignore la casse, et « Enregistré » trouverait « …pas encore enregistrées ». */
const enregistre = (page: Page) => page.getByRole("status").filter({ hasText: /^✓ Enregistré$/ });

test.beforeEach(async ({ request }) => {
  await request.get(`${STUB}/__reset`);
});

test("sauvegarde automatique : « Enregistré » sans cliquer, retrouvé après rechargement", async ({ page }) => {
  await nouveauProjet(page);
  await sujet(page).fill("Vendre du pain");
  await expect(etat(page, "Modifications locales")).toBeVisible();
  await expect(enregistre(page)).toBeVisible({ timeout: 5000 });
  await page.reload();
  await expect(sujet(page)).toHaveValue("Vendre du pain");
});

test("coupure puis retour : l'état le dit, la reprise enregistre seule", async ({ page, context }) => {
  await nouveauProjet(page);
  await context.setOffline(true);
  await sujet(page).fill("Écrit hors ligne");
  await expect(etat(page, "Connexion interrompue : vos modifications sont gardées sur cet appareil.")).toBeVisible({ timeout: 5000 });
  await context.setOffline(false);
  await expect(enregistre(page)).toBeVisible({ timeout: 8000 });
  await page.reload();
  await expect(sujet(page)).toHaveValue("Écrit hors ligne");
});

test("onglet fermé hors ligne : la copie locale est proposée, reprise, puis enregistrée (T15)", async ({ page, context }) => {
  const url = await nouveauProjet(page);
  await context.setOffline(true);
  await sujet(page).fill("Sauvé par l'appareil");
  await expect(etat(page, "Connexion interrompue")).toBeVisible({ timeout: 5000 });
  await page.close();
  await context.setOffline(false);

  const retour = await context.newPage();
  await retour.goto(url);
  await expect(retour.getByText(/Des modifications non enregistrées existent sur cet appareil/)).toBeVisible();
  await expect(sujet(retour)).toHaveValue("", { timeout: 2000 }); // la version du serveur, tant qu'on n'a rien choisi
  await retour.getByRole("button", { name: "Les reprendre" }).click();
  await expect(sujet(retour)).toHaveValue("Sauvé par l'appareil");
  await expect(enregistre(retour)).toBeVisible({ timeout: 5000 });
  await retour.reload();
  await expect(sujet(retour)).toHaveValue("Sauvé par l'appareil");
  await expect(retour.getByText(/Des modifications non enregistrées/)).toHaveCount(0);
});

test("stockage refusé : l'édition en ligne marche et la limite est annoncée (T16)", async ({ page, context }) => {
  await context.addInitScript(() => {
    Object.defineProperty(window, "localStorage", { get() { throw new Error("stockage refusé"); } });
  });
  await nouveauProjet(page);
  await expect(page.getByText("Cet appareil ne garde pas de brouillon local")).toBeVisible();
  await sujet(page).fill("Sans stockage");
  await expect(enregistre(page)).toBeVisible({ timeout: 5000 });
});

test("changement de compte puis déconnexion : aucun brouillon d'un autre ne reste (T14)", async ({ page, context }) => {
  const url = await nouveauProjet(page);
  const projetId = url.split("/").pop();
  await page.evaluate(([cle]) => localStorage.setItem(cle, "{}"), [`${PREFIXE}${VENDEUR}:${projetId}`]);
  const cles = () => page.evaluate((p) => Object.keys(localStorage).filter((k) => k.startsWith(p)), PREFIXE);
  expect(await cles()).toHaveLength(1);

  await connecte(page, "other"); // même appareil, autre compte
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect.poll(cles).toEqual([]);

  // Déconnexion : un brouillon du compte connecté part lui aussi.
  await page.evaluate(([cle]) => localStorage.setItem(cle, "{}"), [`${PREFIXE}11400000-0000-4000-8000-000000000002:x`]);
  await context.clearCookies();
  await page.goto("/");
  await expect.poll(cles).toEqual([]);
});

test("quitter avec des modifications non enregistrées : le navigateur avertit", async ({ page, context }) => {
  await nouveauProjet(page);
  await context.setOffline(true); // l'état reste « non enregistré »
  await sujet(page).fill("Pas encore enregistré");
  await expect(etat(page, "Connexion interrompue")).toBeVisible({ timeout: 5000 });
  const dialogue = page.waitForEvent("dialog");
  await page.close({ runBeforeUnload: true });
  const d = await dialogue;
  expect(d.type()).toBe("beforeunload");
  await d.accept();
});
