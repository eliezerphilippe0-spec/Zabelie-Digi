import { test, expect, type Page } from "@playwright/test";
import { createHash } from "node:crypto";

/**
 * Studio de création éditoriale — « Soumettre à la revue » (tâche 5.2 ; PRD
 * T19, T20, T03). Contre `e2e/fixtures/stub-creation.mjs`, qui reproduit ce
 * que la base garantit : écriture des fiches par le service role seul, une
 * fiche par projet, lecture du vendeur bornée à ses fiches.
 */
const STUB = "http://127.0.0.1:15431";
const VENDEUR = "11400000-0000-4000-8000-000000000001";

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

/** Crée puis approuve le PDF à l'écran ; rend l'empreinte des octets réellement servis. */
async function pdfApprouve(page: Page) {
  const s = page.getByRole("region", { name: "5. Le PDF" });
  await s.getByRole("button", { name: "Créer le PDF" }).click();
  const lien = s.getByRole("link", { name: /^Aperçu \(s’ouvre/ });
  const signe = (await page.request.get((await lien.getAttribute("href"))!, { maxRedirects: 0 })).headers()["location"];
  const empreinte = createHash("sha256").update(await (await page.request.get(signe)).body()).digest("hex");
  const onglet = page.context().waitForEvent("page");
  await lien.click();
  await (await onglet).close();
  await s.getByRole("button", { name: "Approuver ce PDF" }).click();
  await expect(s.getByRole("status").filter({ hasText: /^✓ PDF approuvé le/ })).toBeVisible();
  return empreinte;
}

const sectionFiche = (page: Page) => page.getByRole("region", { name: "6. La fiche produit" });

type Fiches = {
  produits: Record<string, unknown>[];
  ateliers: Record<string, Record<string, unknown>>;
  livrables: { product_id: string; storage_path: string; file_name: string; size_bytes: number }[];
  fichiers: { chemin: string; empreinte: string }[];
};

test("soumettre : une fiche en brouillon, le PDF approuvé joint, puis reprise et modération", async ({ page, request }) => {
  const projet = await guideApprouve(page);
  const s = sectionFiche(page);
  await expect(s.getByText("Approuvez d’abord le PDF : c’est lui qui sera vendu.")).toBeVisible();
  const empreinte = await pdfApprouve(page);

  const soumettre = s.getByRole("button", { name: "Soumettre à la revue" });
  await expect(soumettre).toBeDisabled(); // ni prix, ni rayon, ni attestation
  await s.getByRole("spinbutton", { name: "Prix (HTG)", exact: true }).fill("750");
  await s.getByRole("combobox", { name: "Rayon", exact: true }).selectOption({ label: "Éducation" });
  await s.getByRole("combobox", { name: "Sous-rayon", exact: true }).selectOption({ label: "Guides pratiques" });
  await expect(soumettre).toBeDisabled(); // l'attestation n'est jamais pré-cochée
  await s.getByRole("checkbox").check();
  await soumettre.click();
  await expect(s.getByRole("status")).toHaveText("Fiche en attente de revue. Vous pouvez la compléter (photo, description) dans vos produits.");
  await expect(s.getByText("✓ La fiche contient ce PDF.")).toBeVisible();
  await expect(s.getByRole("link", { name: "Voir mes produits" })).toHaveAttribute("href", "/vendre?type=numeriques#mes-produits");

  // Ce que la « base » a reçu : UNE fiche en brouillon rattachée au projet, et le PDF approuvé, octet pour octet.
  const f = (await (await request.get(`${STUB}/__fiches`)).json()) as Fiches;
  expect(f.produits).toHaveLength(1);
  const fiche = f.produits[0];
  expect(fiche).toMatchObject({
    seller_id: VENDEUR, zabelie_authoring_project_id: projet, status: "draft", kind: "fichier",
    title: "Lancer sa boutique en ligne", category: "Éducation", category_id: "11400000-0000-4000-8000-0000000000c2", price_htg: 750,
  });
  expect(f.livrables).toHaveLength(1);
  expect(f.livrables[0].product_id).toBe(fiche.id);
  expect(f.livrables[0].storage_path).toMatch(new RegExp(`^${VENDEUR}/${fiche.id}/liv-[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\.pdf$`));
  expect(f.livrables[0].file_name).toBe("Lancer_sa_boutique_en_ligne.pdf");
  expect(f.fichiers).toEqual([{ chemin: f.livrables[0].storage_path, empreinte }]);
  // 5.3 : l'atelier numérique pré-rempli depuis le guide (format, langue, sommaire, aperçu).
  expect(f.ateliers[`zabelie_digital_details:${fiche.id}`]).toMatchObject({ formats: "PDF", language: "Français" });
  expect(String(f.ateliers[`zabelie_digital_details:${fiche.id}`].contents)).toMatch(/^\d+ pages\n• /);
  expect(f.ateliers[`zabelie_digital_studio:${fiche.id}`]).toMatchObject({ mode: "file", include_updates: false, outcomes: "Vendre en ligne" });

  // Reprise : la page relue montre la fiche ; remettre le PDF ne crée ni fiche ni ligne de plus (T20).
  await page.reload();
  const s2 = sectionFiche(page);
  await expect(s2.getByRole("status")).toHaveText(/^Fiche en attente de revue/);
  await expect(s2.getByRole("button", { name: "Soumettre à la revue" })).toHaveCount(0);
  await s2.getByRole("button", { name: "Mettre ce PDF sur la fiche" }).click();
  await expect(s2.getByText("✓ La fiche contient ce PDF.")).toBeVisible();
  const g = (await (await request.get(`${STUB}/__fiches`)).json()) as Fiches;
  expect(g.produits).toHaveLength(1);
  expect(g.livrables).toHaveLength(1);

  // La modération met en vente : l'écran le dit, et n'offre plus de modifier la fiche d'ici.
  await request.get(`${STUB}/__publier`);
  await page.reload();
  await expect(sectionFiche(page).getByRole("status")).toHaveText("Votre guide est en vente.");
  await expect(sectionFiche(page).getByRole("button")).toHaveCount(0);
});

test("serveur : deux soumissions simultanées, une seule fiche (T19) ; le projet d'un autre reste introuvable (T03)", async ({ page, browser, request }) => {
  const projet = await guideApprouve(page);
  const api = `/api/digital-authoring/projects/${projet}`;
  const lu = await (await page.request.get(api)).json();
  const exp = (await (await page.request.post(`${api}/exports`, { data: { revision: lu.projet.revision } })).json()).export;
  expect((await page.request.post(`/api/digital-authoring/exports/${exp.id}`, { data: { empreinte: exp.empreinte } })).status()).toBe(200);

  const corps = { export: exp.id, prix: 500, rayon: "Éducation", sousRayon: null, attestation: true };
  const [a, b] = await Promise.all([page.request.post(`${api}/soumission`, { data: corps }), page.request.post(`${api}/soumission`, { data: corps })]);
  expect([a.status(), b.status()].sort()).toEqual([200, 201]);
  expect((await a.json()).fiche).toEqual((await b.json()).fiche);
  const f = (await (await request.get(`${STUB}/__fiches`)).json()) as Fiches;
  expect(f.produits).toHaveLength(1);
  expect(f.livrables).toHaveLength(1);

  // Sans attestation, aucune fiche ne naît.
  await request.get(`${STUB}/__reset`);
  const projet2 = await guideApprouve(page);
  const api2 = `/api/digital-authoring/projects/${projet2}`;
  const lu2 = await (await page.request.get(api2)).json();
  const exp2 = (await (await page.request.post(`${api2}/exports`, { data: { revision: lu2.projet.revision } })).json()).export;
  const nonApprouve = await page.request.post(`${api2}/soumission`, { data: { ...corps, export: exp2.id } });
  expect(nonApprouve.status()).toBe(409); // le PDF n'est pas approuvé
  await page.request.post(`/api/digital-authoring/exports/${exp2.id}`, { data: { empreinte: exp2.empreinte } });
  const sansAttestation = await page.request.post(`${api2}/soumission`, { data: { ...corps, export: exp2.id, attestation: false } });
  expect(sansAttestation.status()).toBe(400);
  expect(((await (await request.get(`${STUB}/__fiches`)).json()) as Fiches).produits).toHaveLength(0);

  // Un autre vendeur ne soumet pas le projet de A.
  const autre = await browser.newContext();
  const p2 = await autre.newPage();
  await p2.goto(`${STUB}/__login?role=other&lang=fr&next=${encodeURIComponent("/tableau-de-bord/creation")}`);
  const intrus = await p2.request.post(`${api2}/soumission`, { data: { ...corps, export: exp2.id } });
  expect(intrus.status()).toBe(404);
  await autre.close();
  expect(((await (await request.get(`${STUB}/__fiches`)).json()) as Fiches).produits).toHaveLength(0);
});

test("fiche à 360 px : aucun débordement horizontal, cibles de 44 px", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await guideApprouve(page);
  await pdfApprouve(page);
  const s = sectionFiche(page);
  await s.getByRole("combobox", { name: "Rayon", exact: true }).selectOption({ label: "Éducation" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  for (const cible of [
    s.getByRole("spinbutton", { name: "Prix (HTG)", exact: true }),
    s.getByRole("combobox", { name: "Rayon", exact: true }),
    s.getByRole("combobox", { name: "Sous-rayon", exact: true }),
    s.getByRole("button", { name: "Soumettre à la revue" }),
  ]) {
    expect((await cible.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
});
