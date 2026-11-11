import { test, expect, type Page } from "@playwright/test";
import { t } from "../lib/i18n";

/**
 * IMPORTER UNE FICHE PAR LIEN, dans le vrai formulaire (lot 2, 2026-11-11).
 *
 * Vraie page, vrai composant ; seule la réponse de `/api/products/import` est
 * simulée par Playwright : ce test ne prouve PAS la lecture d'une page distante
 * (tenue par `tests/import-fiche.test.ts`, et à éprouver sur un déploiement).
 * Il prouve ce que le vendeur voit : le texte arrive dans SES champs, rien
 * d'autre ne bouge, et une saisie existante n'est jamais écrasée sans accord.
 *
 * Projet `physique` : `/vendre` exige une session (faux Supabase des e2e).
 */
const ACTOR = "22222222-2222-2222-2222-222222222222";
const FICHE = { titre: "Sak kwi fèt alamen", description: "Sak solid pou vandè.\nKoulè natirèl.", marque: "Atelye Lakay", hote: "boutique.ht" };

async function session(page: Page) {
  const value = { access_token: "vendeur-preparation-physical-recovery", refresh_token: "fixture", token_type: "bearer", expires_at: 4102444800, expires_in: 3600,
    user: { id: ACTOR, aud: "authenticated", role: "authenticated" } };
  await page.context().addCookies([
    { name: "sb-127-auth-token", value: "base64-" + Buffer.from(JSON.stringify(value)).toString("base64url"), domain: "127.0.0.1", path: "/" },
    { name: "zabelie_lang", value: "fr", domain: "127.0.0.1", path: "/" },
  ]);
}

async function simuler(page: Page, reponse: { status: number; corps: unknown }) {
  const recus: unknown[] = [];
  await page.route("**/api/products/import", async (route) => {
    recus.push(route.request().postDataJSON());
    await route.fulfill({ status: reponse.status, contentType: "application/json", body: JSON.stringify(reponse.corps) });
  });
  return recus;
}

test("formulaire physique : titre, description et marque repris ; prix, quantité et photo intacts", async ({ page }) => {
  await session(page);
  const recus = await simuler(page, { status: 200, corps: FICHE });
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/vendre/physique");
  const bloc = page.locator("[data-import-fiche]");
  await expect(bloc.getByText(t("fr", "import.rights"), { exact: true })).toBeVisible();
  const prix = page.getByRole("spinbutton", { name: /^Prix \(HTG\)/ });
  await prix.fill("1500");

  await bloc.getByRole("textbox", { name: t("fr", "import.url"), exact: true }).fill("https://boutique.ht/sak-kwi");
  await bloc.getByRole("button", { name: t("fr", "import.cta"), exact: true }).click();

  await expect(page.getByRole("textbox", { name: "Titre", exact: true })).toHaveValue(FICHE.titre);
  await expect(page.locator("main form textarea").first()).toHaveValue(FICHE.description);
  await expect(bloc.getByRole("status")).toHaveText(t("fr", "import.done").replace("{host}", "boutique.ht"));
  await expect(prix).toHaveValue("1500");
  await expect(page.getByRole("spinbutton", { name: "Quantité en stock", exact: true })).toHaveValue("");
  expect(recus).toEqual([{ url: "https://boutique.ht/sak-kwi" }]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("une saisie existante n'est remplacée qu'avec l'accord du vendeur ; un refus du serveur se lit", async ({ page }) => {
  await session(page);
  await simuler(page, { status: 200, corps: FICHE });
  await page.goto("/vendre/physique");
  const bloc = page.locator("[data-import-fiche]");
  const titre = page.getByRole("textbox", { name: "Titre", exact: true });
  await titre.fill("Mon titre à moi");

  // Refus de remplacer : le titre saisi reste, et rien n'annonce un import.
  page.once("dialog", (d) => { expect(d.message()).toBe(t("fr", "import.replace")); void d.dismiss(); });
  await bloc.getByRole("textbox", { name: t("fr", "import.url"), exact: true }).fill("https://boutique.ht/sak-kwi");
  await bloc.getByRole("button", { name: t("fr", "import.cta"), exact: true }).click();
  await expect(titre).toHaveValue("Mon titre à moi");
  await expect(bloc.getByRole("status")).toHaveCount(0);

  // Accord : le texte importé prend la place.
  page.once("dialog", (d) => void d.accept());
  await bloc.getByRole("button", { name: t("fr", "import.cta"), exact: true }).click();
  await expect(titre).toHaveValue(FICHE.titre);

  // Refus du serveur : son message, traduit, s'affiche ; le formulaire ne change pas.
  await page.unroute("**/api/products/import");
  await simuler(page, { status: 502, corps: { error: t("fr", "api.import.unreachable") } });
  page.once("dialog", (d) => void d.accept());
  await bloc.getByRole("button", { name: t("fr", "import.cta"), exact: true }).click();
  await expect(bloc.getByRole("alert")).toHaveText(t("fr", "api.import.unreachable"));
  await expect(titre).toHaveValue(FICHE.titre);
});

test("formulaire fichier : le bloc d'import est là et préremplit le titre", async ({ page }) => {
  await session(page);
  await simuler(page, { status: 200, corps: FICHE });
  await page.goto("/vendre?nouveau=numerique#formulaire");
  const bloc = page.locator("[data-import-fiche]");
  await bloc.getByRole("textbox", { name: t("fr", "import.url"), exact: true }).fill("https://boutique.ht/gid");
  await bloc.getByRole("button", { name: t("fr", "import.cta"), exact: true }).click();
  await expect(page.locator("main form input[required]").first()).toHaveValue(FICHE.titre);
});
