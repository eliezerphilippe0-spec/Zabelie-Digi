import { test, expect, type Browser, type Page } from "@playwright/test";

/**
 * MISE EN LIGNE, de bout en bout : une fiche créée par un vendeur n'apparaît
 * au catalogue qu'après la modération (tous les types naissent en brouillon),
 * et la modération exige un administrateur avec double authentification.
 *
 * Né le 2026-10-18 d'une vérification en production : catalogue vide, et le
 * seul compte administrateur sans facteur vérifié, donc sans accès à la
 * modération. Ce test montre le chemin qui marche et les deux refus qui
 * expliquent l'écran vide (MFA absente, fichier sans attestation antivirus).
 *
 * Contre `e2e/fixtures/stub-creation.mjs` : écritures des fiches par le
 * service role seul, lecture publique des seules fiches publiées.
 */
const STUB = "http://127.0.0.1:15431";
const TITRE = "Retouche photo express";

test.beforeEach(async ({ request }) => {
  await request.get(`${STUB}/__reset`);
});

async function connecte(browser: Browser, role: string, suite: string) {
  const contexte = await browser.newContext();
  const page = await contexte.newPage();
  await page.goto(`${STUB}/__login?role=${role}&lang=fr&next=${encodeURIComponent(suite)}`);
  return { contexte, page };
}

async function catalogue(browser: Browser) {
  const contexte = await browser.newContext();
  const page = await contexte.newPage();
  await page.goto("/catalogue");
  return { contexte, page };
}

type Fiche = { id: string; title: string; status: string; kind: string; price_htg: number };
const fiches = async (page: Page) => (await (await page.request.get(`${STUB}/__fiches`)).json()).produits as Fiche[];

test("un service : créé par le vendeur, invisible en brouillon, publié par la modération, visible au catalogue", async ({ browser }) => {
  // 1. Le vendeur remplit le formulaire de /vendre, comme sur zabelie.com.
  const vendeur = await connecte(browser, "seller", "/vendre");
  const v = vendeur.page;
  await v.getByRole("textbox", { name: "Titre du produit" }).fill(TITRE);
  await v.getByRole("combobox", { name: "Type de produit" }).selectOption({ label: "Service" });
  await v.getByRole("combobox", { name: "Catégorie", exact: true }).selectOption({ label: "Éducation" });
  await v.getByRole("spinbutton", { name: "Prix (HTG)" }).fill("500");
  await v.getByRole("textbox", { name: "Description" }).fill("Je retouche une photo de produit pour votre boutique, livrée le jour même.");
  await v.getByRole("spinbutton", { name: /^Délai de livraison/ }).fill("0");
  await v.getByRole("checkbox").last().check();
  await v.getByRole("button", { name: "Publier le produit" }).click();
  await expect.poll(async () => (await fiches(v)).length).toBe(1);
  const [fiche] = await fiches(v);
  expect(fiche).toMatchObject({ title: TITRE, kind: "service", status: "draft", price_htg: 500 });
  await vendeur.contexte.close();

  // 2. Brouillon : le public ne le voit pas.
  const avant = await catalogue(browser);
  await expect(avant.page.getByText("0 résultat.")).toBeVisible();
  await expect(avant.page.getByText(TITRE)).toHaveCount(0);
  await avant.contexte.close();

  // 3. La modération le publie depuis /admin (administrateur avec double authentification).
  const admin = await connecte(browser, "admin", "/admin");
  const ligne = admin.page.getByRole("listitem").filter({ hasText: TITRE });
  await ligne.getByRole("combobox").selectOption("published");
  await expect.poll(async () => (await fiches(admin.page))[0].status).toBe("published");
  await expect(ligne.getByRole("alert")).toHaveCount(0);
  await admin.contexte.close();

  // 4. Le public le voit au catalogue, puis sur sa fiche.
  const apres = await catalogue(browser);
  await expect(apres.page.getByText("1 résultat.")).toBeVisible();
  await apres.page.getByRole("link", { name: new RegExp(TITRE) }).first().click();
  await expect(apres.page.getByRole("heading", { level: 1, name: TITRE })).toBeVisible();
  await expect(apres.page.getByText(/500/).first()).toBeVisible();
  await apres.contexte.close();
});

test("sans double authentification, la modération est fermée : rien ne se publie", async ({ browser }) => {
  const vendeur = await connecte(browser, "seller", "/vendre");
  const cree = await vendeur.page.request.post("/api/products", {
    data: { title: TITRE, description: "Test", kind: "service", category: "Éducation", priceHTG: 500, policyAccepted: true },
  });
  expect(cree.status()).toBe(200);
  const [fiche] = await fiches(vendeur.page);
  await vendeur.contexte.close();

  // Le compte administrateur du porteur, tel qu'il était en production : rôle admin, aucun facteur.
  const sansMfa = await connecte(browser, "adminSansMfa", "/");
  const refus = await sansMfa.page.request.post("/api/admin/product-status", { data: { productId: fiche.id, status: "published" } });
  expect(refus.status()).toBe(403);
  expect((await fiches(sansMfa.page))[0].status).toBe("draft");
  await sansMfa.contexte.close();
});

test("un fichier sans attestation antivirus ne se publie pas, même avec son livrable", async ({ browser }) => {
  // Un guide du Studio soumis : la fiche a son PDF, mais aucun reçu ClamAV n'existe.
  const vendeur = await connecte(browser, "seller", "/tableau-de-bord/creation?depart=modele");
  const p = vendeur.page;
  await p.getByRole("textbox", { name: "Titre de travail" }).fill("Lancer sa boutique en ligne");
  await p.getByRole("button", { name: "Créer le projet" }).click();
  await expect(p).toHaveURL(/\/tableau-de-bord\/creation\/[0-9a-f-]{36}$/);
  const api = new URL(p.url()).pathname.replace("/tableau-de-bord/creation/", "/api/digital-authoring/projects/");
  const brief = { sujet: "Vendre en ligne", publicDetail: "Petits commerçants", probleme: "Ne savent pas commencer", resultat: "Ouvrir sa boutique",
    methode: "Ma méthode", exemples: "", prerequis: "", ton: "", limitesMethode: "", notes: "", references: "" };
  const sections = Array.from({ length: 7 }, (_, i) => ({ id: crypto.randomUUID(), titre: `Étape ${i + 1}`, resultat: `Savoir ${i + 1}`, corps: `Section ${i + 1} : expliquée pas à pas.` }));
  let lu = await (await p.request.get(api)).json();
  const rev = (await (await p.request.patch(api, { data: { revisionAttendue: lu.projet.revision, jeton: crypto.randomUUID(), brief, contenu: { objectif: "Ouvrir sa boutique", sections } } })).json()).revision;
  expect((await p.request.post(api, { data: { action: "approuver_plan", revision: rev } })).status()).toBe(200);
  lu = await (await p.request.get(api)).json();
  expect((await p.request.post(api, { data: { action: "approuver_guide", revision: lu.projet.revision, responsabilite: true } })).status()).toBe(200);
  const exp = (await (await p.request.post(`${api}/exports`, { data: { revision: lu.projet.revision } })).json()).export;
  await p.request.post(`/api/digital-authoring/exports/${exp.id}`, { data: { empreinte: exp.empreinte } });
  expect((await p.request.post(`${api}/soumission`, { data: { export: exp.id, prix: 750, rayon: "Éducation", attestation: true } })).status()).toBe(201);
  const [fiche] = await fiches(p);
  await vendeur.contexte.close();

  const admin = await connecte(browser, "admin", "/");
  const refus = await admin.page.request.post("/api/admin/product-status", { data: { productId: fiche.id, status: "published" } });
  expect(refus.status()).toBe(503);
  expect((await refus.json()).code).toBe("file_security_pending");
  expect((await fiches(admin.page))[0].status).toBe("draft");
  await admin.contexte.close();
});
