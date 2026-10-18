import { test, expect, type Page } from "@playwright/test";
import { createHash } from "node:crypto";

/**
 * Studio de création éditoriale — export PDF privé et approbation de
 * l'export exact (tâche 4.3 ; PRD T18, T28). Contre
 * `e2e/fixtures/stub-creation.mjs` : le stockage y garde les octets RÉELS
 * déposés par la route, et ne les rend que par un lien signé.
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
}

const sectionPdf = (page: Page) => page.getByRole("region", { name: "5. Le PDF" });

test("PDF : créé depuis la révision approuvée, octets vérifiés, approuvé tel quel, puis périmé à la modification", async ({ page, request }) => {
  await guideApprouve(page);
  const s = sectionPdf(page);
  await s.getByRole("button", { name: "Créer le PDF" }).click();
  await expect(s.getByText(/^PDF du guide : \d+ pages · \d+ Ko$/)).toBeVisible();
  await expect(s.getByText(/^Extrait gratuit : \d+ pages · \d+ Ko$/)).toBeVisible();
  const approuver = s.getByRole("button", { name: "Approuver ce PDF" });
  await expect(approuver).toBeDisabled(); // rien ne s'approuve sans avoir ouvert l'aperçu

  // Le lien passe par la route, qui redirige vers une URL signée ; le fichier est un vrai PDF,
  // dont l'empreinte est celle qu'affiche l'écran.
  const lien = s.getByRole("link", { name: /^Aperçu \(s’ouvre/ });
  const href = (await lien.getAttribute("href"))!;
  const redirection = await page.request.get(href, { maxRedirects: 0 });
  expect(redirection.status()).toBe(303);
  expect(redirection.headers()["cache-control"]).toBe("private, no-store");
  const signe = redirection.headers()["location"];
  expect(signe).toMatch(/^http:\/\/127\.0\.0\.1:15431\/storage\/v1\/object\/sign\/authoring-exports\/.+\.pdf\?token=/);
  const octets = await (await request.get(signe)).body();
  expect(octets.subarray(0, 8).toString("latin1")).toBe("%PDF-1.4");
  const empreinte = createHash("sha256").update(octets).digest("hex");
  await expect(s.getByText(`Empreinte du fichier : ${empreinte.slice(0, 12)}…${empreinte.slice(-6)}`)).toBeVisible();
  const telecharger = await page.request.get((await s.getByRole("link", { name: "Télécharger" }).getAttribute("href"))!, { maxRedirects: 0 });
  expect(telecharger.headers()["location"]).toContain("download=guide.pdf");

  // L'aperçu ouvert, le fichier s'approuve.
  const onglet = page.context().waitForEvent("page");
  await lien.click();
  await (await onglet).close();
  await expect(approuver).toBeEnabled();
  await approuver.click();
  await expect(s.getByRole("status").filter({ hasText: /^✓ PDF approuvé le .+ C’est ce fichier exact que recevront vos acheteurs\.$/ })).toBeVisible();
  await page.reload();
  await expect(sectionPdf(page).getByRole("status").filter({ hasText: /^✓ PDF approuvé le/ })).toBeVisible();

  // T18 : le guide modifié, le PDF ne vaut plus ; après une nouvelle approbation du guide, l'écran le dit.
  await page.getByRole("textbox", { name: /^Texte de la section : / }).nth(1).fill("Section 2, revue et précisée.");
  await expect(page.getByRole("status").filter({ hasText: /^✓ Enregistré$/ })).toBeVisible({ timeout: 5000 });
  await expect(sectionPdf(page).getByText("Approuvez le guide dans la relecture pour créer son PDF.")).toBeVisible();
  const r = page.getByRole("region", { name: "4. La relecture" });
  await r.getByRole("checkbox").check();
  await r.getByRole("button", { name: "Approuver ce guide" }).click();
  await expect(sectionPdf(page).getByText("⚠ Votre dernier PDF vient d’une ancienne version du guide : créez-en un nouveau.")).toBeVisible();
  await expect(sectionPdf(page).getByRole("button", { name: "Créer le PDF" })).toBeVisible();
});

test("serveur : export ancien refusé (T18), empreinte différente refusée (T28), lien d'un autre vendeur introuvable", async ({ page, browser }) => {
  await guideApprouve(page);
  const projet = new URL(page.url()).pathname.split("/").pop()!;
  const api = `/api/digital-authoring/projects/${projet}`;
  const lu = await (await page.request.get(api)).json();
  const premier = await page.request.post(`${api}/exports`, { data: { revision: lu.projet.revision } });
  expect(premier.status()).toBe(201);
  const ancien = (await premier.json()).export;
  // Même révision, mêmes octets : la même ligne.
  const encore = await page.request.post(`${api}/exports`, { data: { revision: lu.projet.revision } });
  expect((await encore.json()).export.id).toBe(ancien.id);

  // T28 : une autre empreinte que celle de l'export.
  const faux = await page.request.post(`/api/digital-authoring/exports/${ancien.id}`, { data: { empreinte: "0".repeat(64) } });
  expect(faux.status()).toBe(409);

  // Le guide change : l'ancien export ne s'approuve plus, même avec la bonne empreinte (T18).
  const maj = await page.request.patch(api, { data: { revisionAttendue: lu.projet.revision, jeton: crypto.randomUUID(), projet: { titre: "Lancer sa boutique, version 2", langue: lu.projet.langue, public: lu.projet.public_vise, marcheDiaspora: lu.projet.marche_diaspora } } });
  expect(maj.status()).toBe(200);
  const perime = await page.request.post(`/api/digital-authoring/exports/${ancien.id}`, { data: { empreinte: ancien.empreinte } });
  expect(perime.status()).toBe(409);
  // Et la création refuse une révision non approuvée.
  const nonApprouve = await page.request.post(`${api}/exports`, { data: { revision: (await maj.json()).revision } });
  expect(nonApprouve.status()).toBe(409);

  // Un autre vendeur ne peut ouvrir ce PDF, ni l'approuver.
  const autre = await browser.newContext();
  const p2 = await autre.newPage();
  await p2.goto(`${STUB}/__login?role=other&lang=fr&next=${encodeURIComponent("/tableau-de-bord/creation")}`);
  const ouvrir = await p2.request.get(`/api/digital-authoring/exports/${ancien.id}?document=guide`, { maxRedirects: 0 });
  expect(ouvrir.status()).toBe(404);
  const approuver = await p2.request.post(`/api/digital-authoring/exports/${ancien.id}`, { data: { empreinte: ancien.empreinte } });
  expect(approuver.status()).toBe(404);
  await autre.close();
});

test("PDF à 360 px : aucun débordement horizontal, cibles de 44 px", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await guideApprouve(page);
  const s = sectionPdf(page);
  await s.getByRole("button", { name: "Créer le PDF" }).click();
  await expect(s.getByText(/^PDF du guide : /)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  for (const cible of [s.getByRole("link", { name: /^Aperçu \(/ }), s.getByRole("link", { name: "Télécharger" }), s.getByRole("button", { name: "Approuver ce PDF" })]) {
    expect((await cible.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
});
