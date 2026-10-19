import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

/**
 * ESSAYAGE VIRTUEL — le parcours réel, dans un navigateur, à 360 px (docs/74,
 * tâche 4.5). Le serveur Next tourne avec le fournisseur « simulation » : rien
 * ne sort de la machine et rien n'est payé. Le faux Supabase répond aux
 * fonctions d'essayage et rend ce qu'il a noté (`/__essayage`).
 *
 * Chaque test a son propre acheteur, choisi pour son groupe de mesure
 * (`e2e/fixtures/stub-supabase.mjs`) : les tests tournent en parallèle sans se
 * marcher dessus.
 */

const STUB = "http://127.0.0.1:15421";
const ROBE_ID = "e55a1000-0000-4000-8000-0000000000a1";
const ROBE = "/produit/wob-lakay-test";
const PHOTO = readFileSync("e2e/fixtures/cover.png");
const compte = (n: number) => `e55a1000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const TEMOIN = compte(1);
const PARCOURS = compte(2);
const GARDER = compte(3);
const QUOTA = compte(4);
const PAUSE = compte(5);
const LANGUES = compte(7);

test.use({ viewport: { width: 360, height: 780 } });

async function connecte(page: Page, id: string) {
  const session = {
    access_token: `essayage-${id}`,
    refresh_token: "rafraichissement-de-test",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: 4102444800,
    user: { id, aud: "authenticated", role: "authenticated", email: "achte@example.ht", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" },
  };
  await page.context().addCookies([
    { name: "sb-127-auth-token", value: "base64-" + Buffer.from(JSON.stringify(session), "utf8").toString("base64url"), domain: "127.0.0.1", path: "/" },
  ]);
}

const feuille = (page: Page) => page.locator("dialog[data-essayage-feuille]");

async function sansDebordement(page: Page) {
  const p = await page.evaluate(() => ({ large: document.documentElement.scrollWidth, vue: document.documentElement.clientWidth }));
  expect(p.large, "pas de défilement horizontal de la page").toBeLessThanOrEqual(p.vue);
  const d = await feuille(page).evaluate((el) => ({ large: el.scrollWidth, vue: el.clientWidth }));
  expect(d.large, "pas de défilement horizontal dans la feuille").toBeLessThanOrEqual(d.vue);
}

async function ciblesDe44(page: Page) {
  const cibles = await feuille(page)
    .locator("button, label, a")
    .evaluateAll((els) => els.filter((e) => e.getBoundingClientRect().width > 0).map((e) => ({ texte: (e.textContent ?? "").trim().slice(0, 40), h: e.getBoundingClientRect().height })));
  expect(cibles.length).toBeGreaterThan(0);
  for (const c of cibles) expect(c.h, c.texte).toBeGreaterThanOrEqual(44);
}

async function envoyerPhoto(page: Page) {
  await feuille(page).locator('input[type="file"]:not([capture])').setInputFiles({ name: "moi.png", mimeType: "image/png", buffer: PHOTO });
}

const noteDuStub = async (page: Page) => (await page.request.get(`${STUB}/__essayage`)).json();

test("essayage — parcours complet à 360 px : consentement, photo, attente, résultat avec la mention IA, panier", async ({ page }, info) => {
  await connecte(page, PARCOURS);
  await page.route("**/api/panier", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) }));
  const envoisDePhoto: string[] = [];
  page.on("request", (r) => {
    if (r.postData()?.includes('name="photo"')) envoisDePhoto.push(`${r.method()} ${new URL(r.url()).pathname}`);
  });

  await page.goto(ROBE);
  const bouton = page.locator("[data-essayage-bouton]");
  await expect(bouton).toHaveText("Essayer sur moi");
  await bouton.click();
  const f = feuille(page);
  await expect(f).toBeVisible();
  // Sans consentement, aucun champ photo n'existe.
  await expect(f.locator('input[type="file"]')).toHaveCount(0);
  await expect(f.getByText("J'ai 18 ans ou plus.")).toBeVisible();
  await sansDebordement(page);
  await ciblesDe44(page);

  await f.getByRole("button", { name: "J'accepte et je continue" }).click();
  await expect(f.getByRole("checkbox", { name: "Garder ma photo sur ce téléphone" })).not.toBeChecked();
  await sansDebordement(page);
  await ciblesDe44(page);

  await envoyerPhoto(page);
  await expect(f.getByRole("status")).toContainText("Nous créons votre aperçu");
  const resultat = f.getByRole("img", { name: "Aperçu de « Wòb lakay » porté par vous" });
  await expect(resultat).toBeVisible({ timeout: 20_000 });
  await expect(resultat).toHaveAttribute("src", /^data:image\/svg\+xml;base64,/);
  await expect(f.locator("[data-essayage-mention]")).toHaveText("Aperçu généré par IA. La coupe et la couleur réelles peuvent différer.");
  await sansDebordement(page);
  await ciblesDe44(page);
  await page.screenshot({ path: info.outputPath("essayage-resultat-360.png") });

  await f.getByRole("button", { name: "Ajouter au panier" }).click();
  await expect(f.getByText("Ajouté au panier")).toBeVisible();

  // La photo n'est partie qu'une fois, vers l'API d'essayage ; la base n'a noté que des métadonnées.
  expect(envoisDePhoto).toEqual(["POST /api/essayage"]);
  const note = await noteDuStub(page);
  const essais = note.essais.filter((e: { acheteur_id: string }) => e.acheteur_id === PARCOURS);
  expect(essais).toHaveLength(1);
  expect(essais[0]).toMatchObject({ produit_id: ROBE_ID, fournisseur: "simulation", statut: "reussi", raison: null });
  expect(Object.keys(essais[0]).sort()).toEqual(["acheteur_id", "cree_le", "fournisseur", "id", "produit_id", "raison", "statut", "travail_id"]);
  expect(note.expositions).toContainEqual(expect.objectContaining({ acheteur: PARCOURS, produit: ROBE_ID, groupe: "essai" }));
});

test("essayage — la photo gardée reste sur le téléphone, et « Effacer » la retire vraiment", async ({ page }) => {
  await connecte(page, GARDER);
  const photoDansLeNavigateur = () =>
    page.evaluate(
      () =>
        new Promise<boolean>((resolve) => {
          const o = indexedDB.open("zabelie-essayage", 1);
          o.onupgradeneeded = () => o.result.createObjectStore("photo");
          o.onsuccess = () => {
            const g = o.result.transaction("photo", "readonly").objectStore("photo").get("moi");
            g.onsuccess = () => {
              o.result.close();
              resolve(g.result instanceof Blob);
            };
          };
        }),
    );

  await page.goto(ROBE);
  await page.locator("[data-essayage-bouton]").click();
  const f = feuille(page);
  await f.getByRole("button", { name: "J'accepte et je continue" }).click();
  await f.getByRole("checkbox", { name: "Garder ma photo sur ce téléphone" }).check();
  await envoyerPhoto(page);
  await expect(f.locator("[data-essayage-mention]")).toBeVisible({ timeout: 20_000 });
  expect(await photoDansLeNavigateur()).toBe(true);

  await f.getByRole("button", { name: "Essayer avec une autre photo" }).click();
  await expect(f.getByText("Votre photo gardée sur ce téléphone")).toBeVisible();
  await f.getByRole("button", { name: "Effacer ma photo de ce téléphone" }).click();
  await expect(f.getByText("Photo effacée de ce téléphone.")).toBeVisible();
  await expect(f.getByText("Votre photo gardée sur ce téléphone")).toHaveCount(0);
  expect(await photoDansLeNavigateur()).toBe(false);

  // Le consentement est gardé sur l'appareil : la feuille rouvre sur la photo.
  await page.reload();
  await page.locator("[data-essayage-bouton]").click();
  await expect(feuille(page).getByRole("button", { name: "Prendre une photo" })).toBeVisible();
  await expect(feuille(page).getByText("Votre photo gardée sur ce téléphone")).toHaveCount(0);
});

test("essayage — quota du jour et pause : le message du serveur, dans la feuille", async ({ page }) => {
  for (const [id, message] of [
    [QUOTA, "Vous avez fait tous vos essais du jour. Revenez demain."],
    [PAUSE, "L'essayage virtuel est en pause. Réessayez plus tard."],
  ] as const) {
    await page.context().clearCookies();
    await connecte(page, id);
    await page.goto(ROBE);
    await page.locator("[data-essayage-bouton]").click();
    const f = feuille(page);
    const accepter = f.getByRole("button", { name: "J'accepte et je continue" });
    if (await accepter.isVisible()) await accepter.click();
    await envoyerPhoto(page);
    await expect(f.getByRole("alert")).toHaveText(new RegExp(message.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    await sansDebordement(page);
    await f.getByRole("button", { name: "Fermer" }).click();
    await expect(f).toHaveCount(0);
  }
});

test("essayage — pas de bouton : groupe témoin (exposition notée), anonyme, fiche non éligible", async ({ page }) => {
  await connecte(page, TEMOIN);
  await page.goto(ROBE);
  await expect(page.getByRole("button", { name: "Ajouter au panier" })).toBeVisible();
  await expect(page.locator("[data-essayage-bouton]")).toHaveCount(0);
  const note = await noteDuStub(page);
  expect(note.expositions).toContainEqual(expect.objectContaining({ acheteur: TEMOIN, produit: ROBE_ID, groupe: "temoin" }));

  await page.context().clearCookies();
  await page.goto(ROBE);
  await expect(page.locator("h1")).toContainText("Wòb lakay");
  await expect(page.locator("[data-essayage-bouton]")).toHaveCount(0);

  await connecte(page, PARCOURS);
  await page.goto("/produit/filtre-huile-corolla");
  await expect(page.locator("h1")).toBeVisible();
  await expect(page.locator("[data-essayage-bouton]")).toHaveCount(0);
});

test("essayage — quatre langues à 360 px, en clair et en sombre", async ({ page }) => {
  await connecte(page, LANGUES);
  const attendus = { ht: ["Eseye l sou mwen", "Mwen dakò, m ap kontinye"], fr: ["Essayer sur moi", "J'accepte et je continue"], en: ["Try it on me", "I agree, continue"], es: ["Pruébatelo", "Acepto y continúo"] };
  for (const [lang, [bouton, accepter]] of Object.entries(attendus)) {
    await page.context().addCookies([{ name: "zabelie_lang", value: lang, domain: "127.0.0.1", path: "/" }]);
    await page.goto(ROBE);
    await page.locator("[data-essayage-bouton]").click();
    await expect(page.locator("[data-essayage-bouton]")).toHaveText(bouton);
    await expect(feuille(page).getByRole("button", { name: accepter })).toBeVisible();
    await sansDebordement(page);
    await ciblesDe44(page);
  }

  // Le thème se choisit dans l'en-tête et se garde dans le cookie `zab_theme` (e2e/appearance.spec.ts).
  const fond = async (theme: "light" | "dark") => {
    await page.context().addCookies([{ name: "zab_theme", value: theme, domain: "127.0.0.1", path: "/" }]);
    await page.goto(ROBE);
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await page.locator("[data-essayage-bouton]").click();
    await expect(feuille(page)).toBeVisible();
    await sansDebordement(page);
    return feuille(page).evaluate((el) => {
      const s = getComputedStyle(el);
      return { fond: s.backgroundColor, texte: s.color };
    });
  };
  const clair = await fond("light");
  const sombre = await fond("dark");
  expect(sombre.fond).not.toBe(clair.fond);
  expect(sombre.texte).not.toBe(sombre.fond);
});
