import { test, expect, type Page } from "@playwright/test";

/**
 * Studio de création éditoriale — suppression d'un projet (tâche 5.3 ; 0149 ;
 * PRD T21). Contre `e2e/fixtures/stub-creation.mjs` : seul un projet archivé se
 * supprime, ses PDF quittent le bucket privé, et la fiche produit déjà née
 * reste en place avec son fichier.
 */
const STUB = "http://127.0.0.1:15431";

test.beforeEach(async ({ request }) => {
  await request.get(`${STUB}/__reset`);
});

async function guideApprouve(page: Page) {
  await page.goto(`${STUB}/__login?role=seller&lang=fr&next=${encodeURIComponent("/tableau-de-bord/creation?depart=modele")}`);
  await page.getByRole("textbox", { name: "Titre de travail" }).fill("Lancer sa boutique en ligne");
  await page.getByRole("button", { name: "Créer le projet" }).click();
  await expect(page).toHaveURL(/\/tableau-de-bord\/creation\/[0-9a-f-]{36}$/);
  for (const c of ["Sujet du guide", "Pour qui, précisément", "Le problème que le guide résout", "Ce que le lecteur saura faire à la fin", "Votre expérience ou votre méthode"]) {
    await page.getByRole("textbox", { name: c, exact: true }).fill("Vendre en ligne");
  }
  await page.getByRole("button", { name: "Approuver le plan" }).click();
  await expect(page.getByText("✓ Plan approuvé")).toBeVisible();
  const champs = page.getByRole("textbox", { name: /^Texte de la section : / });
  for (let i = 0; i < 7; i++) await champs.nth(i).fill(`Section ${i + 1} : ce que je fais chaque jour, expliqué pas à pas.`);
  await expect(page.getByRole("status").filter({ hasText: /^✓ Enregistré$/ })).toBeVisible({ timeout: 5000 });
  const r = page.getByRole("region", { name: "4. La relecture" });
  await r.getByRole("checkbox").check();
  await r.getByRole("button", { name: "Approuver ce guide" }).click();
  await expect(r.getByRole("status").filter({ hasText: /^✓ Guide approuvé/ })).toBeVisible();
  return new URL(page.url()).pathname.split("/").pop()!;
}

test("supprimer : seulement archivé, PDF retirés, fiche et fichier vendu intacts", async ({ page, request, browser }) => {
  const projet = await guideApprouve(page);
  const api = `/api/digital-authoring/projects/${projet}`;
  // PDF approuvé puis soumis, par l'API : ce parcours-là est couvert par soumission.spec.ts.
  const lu = await (await page.request.get(api)).json();
  const exp = (await (await page.request.post(`${api}/exports`, { data: { revision: lu.projet.revision } })).json()).export;
  await page.request.post(`/api/digital-authoring/exports/${exp.id}`, { data: { empreinte: exp.empreinte } });
  const soumis = await page.request.post(`${api}/soumission`, { data: { export: exp.id, prix: 500, rayon: "Éducation", attestation: true } });
  expect(soumis.status()).toBe(201);
  expect(await (await request.get(`${STUB}/__objets`)).json()).toHaveLength(2); // le guide et son extrait

  // Projet actif : refusé, rien ne bouge.
  const actif = await page.request.delete(api);
  expect(actif.status()).toBe(409);
  expect((await actif.json()).error).toBe("Archivez d'abord le projet : seul un projet archivé se supprime.");
  expect(await (await request.get(`${STUB}/__objets`)).json()).toHaveLength(2);

  // Un autre vendeur ne le supprime pas, même archivé.
  await page.reload();
  page.on("dialog", (d) => void d.accept());
  await page.getByRole("button", { name: "Archiver le projet" }).click();
  await expect(page.getByText("Ce projet est archivé : lecture seule.")).toBeVisible();
  const autre = await browser.newContext();
  const p2 = await autre.newPage();
  await p2.goto(`${STUB}/__login?role=other&lang=fr&next=${encodeURIComponent("/tableau-de-bord/creation")}`);
  expect((await p2.request.delete(api)).status()).toBe(404);
  await autre.close();

  // Le vendeur confirme : retour au tableau, projet introuvable, PDF partis.
  await page.getByRole("button", { name: "Supprimer définitivement le projet" }).click();
  await expect(page).toHaveURL(/\/tableau-de-bord\/creation$/);
  expect((await page.request.get(api)).status()).toBe(404);
  expect(await (await request.get(`${STUB}/__objets`)).json()).toEqual([]);

  // T21 : la fiche et le fichier vendu restent ; le lien vers le projet passe à null.
  const f = await (await request.get(`${STUB}/__fiches`)).json();
  expect(f.produits).toHaveLength(1);
  expect(f.produits[0].zabelie_authoring_project_id).toBeNull();
  expect(f.livrables).toHaveLength(1);
  expect(f.fichiers).toHaveLength(1);
});
