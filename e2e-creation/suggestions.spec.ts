import { test, expect, type Page } from "@playwright/test";

/**
 * Studio de création éditoriale — suggestions par le moteur SIMULÉ
 * (docs/70, tâche 3.3 ; PRD STU 02, STU 04, T12, T13).
 * Contre `e2e/fixtures/stub-creation.mjs`, sans aucun appel réel.
 */
const STUB = "http://127.0.0.1:15431";

test.beforeEach(async ({ request }) => {
  await request.get(`${STUB}/__reset`);
});

async function guideAvecPlanApprouve(page: Page, lang: "ht" | "fr") {
  await page.goto(`${STUB}/__login?role=seller&lang=${lang}&next=${encodeURIComponent("/tableau-de-bord/creation?depart=modele")}`);
  const fr = lang === "fr";
  await page.getByRole("textbox", { name: fr ? "Titre de travail" : "Tit travay la" }).fill(fr ? "Guide des confitures" : "Gid konfiti");
  await page.getByRole("button", { name: fr ? "Créer le projet" : "Kreye pwojè a" }).click();
  await expect(page).toHaveURL(/\/tableau-de-bord\/creation\/[0-9a-f-]{36}$/);
  const champs = fr
    ? ["Sujet du guide", "Pour qui, précisément", "Le problème que le guide résout", "Ce que le lecteur saura faire à la fin", "Votre expérience ou votre méthode"]
    : ["Sijè gid la", "Pou ki moun egzakteman", "Pwoblèm gid la rezoud", "Sa lektè a ap konn fè lè li fini", "Eksperyans ou oswa metòd ou"];
  for (const c of champs) await page.getByRole("textbox", { name: c, exact: true }).fill("Konfiti");
  await page.getByRole("button", { name: fr ? "Approuver le plan" : "Apwouve plan an" }).click();
  await expect(page.getByText(fr ? "Plan approuvé" : "Plan an apwouve")).toBeVisible();
}

test("section : information AVANT l'envoi, proposition séparée, reprise sur clic seulement", async ({ page }) => {
  await guideAvecPlanApprouve(page, "ht");
  const corps = page.getByRole("textbox", { name: "Tèks seksyon an : Engredyan ak materyèl" });
  await corps.fill("Mo pa m");

  await page.getByRole("button", { name: "Sijere yon bouyon : Engredyan ak materyèl" }).click();
  // Rien n'est parti : l'écran dit d'abord ce qui sera transmis.
  await expect(page.getByText(/Asistan an ap resevwa tit gid la, brief ou a \(san nòt prive ou yo\)/)).toBeVisible();
  await expect(page.getByRole("region", { name: "Sijesyon" })).toHaveCount(0);
  await page.getByRole("button", { name: "Voye", exact: true }).click();

  const proposition = page.getByRole("region", { name: "Sijesyon" });
  await expect(proposition).toContainText("[SIMULASYON]");
  await expect(proposition).toContainText("Sijesyon similasyon pou fè esè");
  await expect(corps).toHaveValue("Mo pa m"); // la réponse n'a rien écrit d'elle-même (T13)
  await expect(page.getByText("Sijesyon ki rete pou jodi a : 9/10").first()).toBeVisible();
  await expect(proposition).not.toContainText("Tèks ou a chanje");

  // Le créateur continue d'écrire : la proposition le signale, sans rien toucher.
  await corps.fill("Mo pa m, ak plis");
  await expect(proposition).toContainText("Tèks ou a chanje depi ou te fè demann lan", { timeout: 5000 });

  await proposition.getByRole("button", { name: "Ajoute l apre" }).click();
  await expect(corps).toHaveValue(/^Mo pa m, ak plis\n\n\[SIMULASYON\]/);
  await expect(page.getByRole("region", { name: "Sijesyon" })).toHaveCount(0);
  await expect(page.getByRole("status").filter({ hasText: /^✓ Li anrejistre$/ })).toBeVisible({ timeout: 5000 });
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Tèks seksyon an : Engredyan ak materyèl" })).toHaveValue(/\[SIMULASYON\]/);
});

test("plan : proposition affichée, « Utiliser ce plan » la reprend ; interface en français, guide en kreyòl (STU 02)", async ({ page }) => {
  await page.goto(`${STUB}/__login?role=seller&lang=fr&next=/tableau-de-bord/creation`);
  await page.getByRole("textbox", { name: "Titre de travail" }).fill("Guide sans plan");
  await page.getByRole("button", { name: "Créer le projet" }).click();
  await expect(page).toHaveURL(/\/tableau-de-bord\/creation\/[0-9a-f-]{36}$/);
  for (const c of ["Sujet du guide", "Pour qui, précisément", "Le problème que le guide résout", "Ce que le lecteur saura faire à la fin", "Votre expérience ou votre méthode"]) {
    await page.getByRole("textbox", { name: c, exact: true }).fill("Confitures");
  }
  await page.getByRole("button", { name: "Proposer un plan" }).click();
  await expect(page.getByText(/L’assistant recevra le titre du guide, votre brief \(sans vos notes privées\) et les titres actuels du plan/)).toBeVisible();
  await page.getByRole("button", { name: "Envoyer", exact: true }).click();
  const proposition = page.getByRole("region", { name: "Suggestion" });
  await expect(proposition.getByRole("listitem")).toHaveCount(3);
  await proposition.getByRole("button", { name: "Utiliser ce plan" }).click();
  // Le guide est en kreyòl (langue par défaut du formulaire) : le plan proposé
  // l'est aussi, quelle que soit la langue de l'interface.
  await expect(page.getByRole("textbox", { name: "1. Titre de la section" })).toHaveValue(/\[SIMULASYON\] Poukisa Confitures enpòtan/);
  await expect(page.getByRole("textbox", { name: "3. Titre de la section" })).toHaveValue(/Egzèsis ak plan aksyon/);
});

test("texte hostile dans une proposition : affiché comme du texte, jamais exécuté ; « Ignorer » ne touche à rien (T12)", async ({ page }) => {
  await guideAvecPlanApprouve(page, "fr");
  const hostile = '<img src=x onerror="window.__xss=1">';
  await page.getByRole("textbox", { name: "1. Titre de la section" }).fill(hostile);
  await expect(page.getByRole("status").filter({ hasText: /^✓ Enregistré$/ })).toBeVisible({ timeout: 5000 });

  await page.getByRole("button", { name: `Suggérer un brouillon : ${hostile}` }).click();
  await page.getByRole("button", { name: "Envoyer", exact: true }).click();
  const proposition = page.getByRole("region", { name: "Suggestion" });
  await expect(proposition).toContainText(hostile); // le texte, littéralement
  expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
  await expect(proposition.locator("img")).toHaveCount(0);

  await proposition.getByRole("button", { name: "Ignorer" }).click();
  await expect(page.getByRole("region", { name: "Suggestion" })).toHaveCount(0);
  const corps = page.getByRole("textbox", { name: `Texte de la section : ${hostile}` });
  await expect(corps).toHaveValue("");

  // « Remplacer » sur un texte déjà écrit : une confirmation d'abord ; la refuser ne touche à rien.
  await corps.fill("Mon texte");
  await page.getByRole("button", { name: `Suggérer un brouillon : ${hostile}` }).click();
  await page.getByRole("button", { name: "Envoyer", exact: true }).click();
  const dialogues: string[] = [];
  page.once("dialog", (d) => { dialogues.push(d.message()); void d.dismiss(); });
  await page.getByRole("region", { name: "Suggestion" }).getByRole("button", { name: "Remplacer le texte" }).click();
  expect(dialogues).toEqual(["Remplacer le texte de cette section par la suggestion ?"]);
  await expect(corps).toHaveValue("Mon texte");
  page.once("dialog", (d) => void d.accept());
  await page.getByRole("region", { name: "Suggestion" }).getByRole("button", { name: "Remplacer le texte" }).click();
  await expect(corps).toHaveValue(/^\[SIMULASYON\]/); // guide en kreyòl, langue par défaut
});
