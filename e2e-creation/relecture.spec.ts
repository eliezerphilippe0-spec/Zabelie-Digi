import { test, expect, type Page } from "@playwright/test";

/**
 * Studio de création éditoriale — relecture et approbation du guide
 * (tâche 4.2 ; fiche-test validée le 2026-10-16). Contre
 * `e2e/fixtures/stub-creation.mjs`, qui refuse comme la fonction de 0144.
 */
const STUB = "http://127.0.0.1:15431";
const EMOJI = String.fromCodePoint(0x1f600);

test.beforeEach(async ({ request }) => {
  await request.get(`${STUB}/__reset`);
});

async function guideAvecPlanApprouve(page: Page) {
  await page.goto(`${STUB}/__login?role=seller&lang=fr&next=${encodeURIComponent("/tableau-de-bord/creation?depart=modele")}`);
  await page.getByRole("textbox", { name: "Titre de travail" }).fill("Lancer sa boutique en ligne");
  await page.getByRole("button", { name: "Créer le projet" }).click();
  await expect(page).toHaveURL(/\/tableau-de-bord\/creation\/[0-9a-f-]{36}$/);
  for (const c of ["Sujet du guide", "Pour qui, précisément", "Le problème que le guide résout", "Ce que le lecteur saura faire à la fin", "Votre expérience ou votre méthode"]) {
    await page.getByRole("textbox", { name: c, exact: true }).fill("Vendre en ligne");
  }
  await page.getByRole("button", { name: "Approuver le plan" }).click();
  await expect(page.getByText("✓ Plan approuvé")).toBeVisible();
}

const relecture = (page: Page) => page.getByRole("region", { name: "4. La relecture" });
const corpsSections = (page: Page) => page.getByRole("textbox", { name: /^Texte de la section : / });
const enregistre = (page: Page) => page.getByRole("status").filter({ hasText: /^✓ Enregistré$/ });

test("relecture : bloquants nommés, conseils libres, approbation d'une révision exacte, périmée à la modification", async ({ page }) => {
  await guideAvecPlanApprouve(page);
  const r = relecture(page);
  const case_ = r.getByRole("checkbox", { name: /J’ai relu ce guide/ });
  const approuver = r.getByRole("button", { name: "Approuver ce guide" });

  // Sections encore vides : pas prêt, case jamais cochée d'avance, bouton fermé même case cochée.
  await expect(r.getByText("Pas encore prêt : corrigez les points bloquants")).toBeVisible();
  // Sept sections vides : UNE carte, qui les liste.
  const vides = r.locator("[data-controle=section_vide]");
  await expect(vides).toHaveCount(1);
  await expect(vides.getByText("Ces sections n’ont pas encore de texte :")).toBeVisible();
  await expect(vides.getByText(/^Section \d · /)).toHaveCount(7);
  await expect(case_).not.toBeChecked();
  await case_.check();
  await expect(approuver).toBeDisabled();

  // Chaque section rédigée ; la première garde un marqueur et un caractère sans dessin.
  const champs = corpsSections(page);
  await expect(champs).toHaveCount(7);
  for (let i = 0; i < 7; i++) await champs.nth(i).fill(`Section ${i + 1} : ce que je fais chaque jour, expliqué pas à pas.`);
  await champs.nth(0).fill(`TODO finir ${EMOJI}`);
  await expect(r.getByText("Une marque de travail en cours est restée dans le texte :")).toBeVisible();
  await expect(r.getByText("TODO", { exact: true })).toBeVisible();
  await expect(r.getByText(`${EMOJI} (U+1F600)`)).toBeVisible();
  await expect(r.getByText(/^Section 1 · Pourquoi cette activité peut marcher$/).first()).toBeVisible();
  await expect(approuver).toBeDisabled();

  // Corrigé : il ne reste que des conseils, qui n'empêchent rien.
  await champs.nth(0).fill("Section 1 : pourquoi les clients achètent, avec mes propres exemples.");
  await expect(r.getByText("Vous pouvez l’approuver, après un coup d’œil aux conseils")).toBeVisible();
  await expect(r.locator("[data-controle=guide_court]")).toBeVisible();
  await expect(approuver).toBeEnabled();
  await expect(enregistre(page)).toBeVisible({ timeout: 5000 });
  await approuver.click();
  const approuve = r.getByRole("status").filter({ hasText: /^✓ Guide approuvé \(version \d+\) : il est prêt pour l’export\.$/ });
  await expect(approuve).toBeVisible();
  await expect(approuver).toHaveCount(0);

  // L'approbation vient du serveur : elle survit au rechargement.
  await page.reload();
  await expect(relecture(page).getByRole("status").filter({ hasText: /^✓ Guide approuvé/ })).toBeVisible();

  // Modifier le texte périme l'approbation ; une nouvelle confirmation est demandée.
  await corpsSections(page).nth(2).fill("Section 3 : une version revue, plus précise.");
  await expect(relecture(page).getByText(/^⚠ Le guide a changé depuis votre approbation de la version \d+/)).toBeVisible();
  await expect(enregistre(page)).toBeVisible({ timeout: 5000 });
  await expect(relecture(page).getByRole("checkbox", { name: /J’ai relu ce guide/ })).not.toBeChecked();
});

test("le serveur refait la fiche : un guide modifié hors de l'écran n'est pas approuvé", async ({ page }) => {
  await guideAvecPlanApprouve(page);
  const champs = corpsSections(page);
  for (let i = 0; i < 7; i++) await champs.nth(i).fill(`Section ${i + 1} : mon texte.`);
  await expect(enregistre(page)).toBeVisible({ timeout: 5000 });
  const url = new URL(page.url()).pathname.replace("/tableau-de-bord/creation/", "/api/digital-authoring/projects/");

  // Un client qui contourne l'écran : texte d'essai enregistré, puis approbation demandée directement.
  const lu = await (await page.request.get(url)).json();
  const contenu = { ...lu.projet.contenu, sections: lu.projet.contenu.sections.map((s: { corps: string }, i: number) => (i === 0 ? { ...s, corps: "[SIMULATION] Brouillon." } : s)) };
  const maj = await page.request.patch(url, { data: { revisionAttendue: lu.projet.revision, jeton: crypto.randomUUID(), contenu } });
  expect(maj.status()).toBe(200);
  const revision = (await maj.json()).revision;

  const sansCase = await page.request.post(url, { data: { action: "approuver_guide", revision } });
  expect(sansCase.status()).toBe(422);
  const refus = await page.request.post(url, { data: { action: "approuver_guide", revision, responsabilite: true } });
  expect(refus.status()).toBe(422);
  const d = await refus.json();
  expect(d.code).toBe("guide_pas_pret");
  expect(d.fiche.controles.map((c: { code: string }) => c.code)).toContain("marqueur_simulation");
  const perimee = await page.request.post(url, { data: { action: "approuver_guide", revision: revision - 1, responsabilite: true } });
  expect(perimee.status()).toBe(409);
});

test("relecture à 360 px : aucun débordement horizontal, cibles de 44 px", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await guideAvecPlanApprouve(page);
  const champs = corpsSections(page);
  await champs.nth(0).fill(`TODO https://zabelie.com/boutik/un-lien-tres-long-qui-ne-se-coupe-pas-de-lui-meme ${EMOJI} 1 500 goud`);
  const r = relecture(page);
  await expect(r.getByText(`${EMOJI} (U+1F600)`)).toBeVisible();
  const largeur = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(largeur).toBeLessThanOrEqual(360);
  for (const cible of [r.getByRole("button", { name: "Approuver ce guide" }), r.locator("label").filter({ has: page.getByRole("checkbox") })]) {
    const boite = await cible.boundingBox();
    expect(boite?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
});
