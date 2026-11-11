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

/**
 * Répond à la PROCHAINE boîte de confirmation, et rend son message une fois la
 * réponse donnée. Le gestionnaire est posé AVANT le clic et tourne tout seul :
 * la boîte peut s'ouvrir pendant que le clic est encore en cours (Playwright
 * attend alors qu'elle soit fermée), ou bien après, quand la réponse de
 * l'import arrive. Attendre la promesse rend les contrôles qui suivent réels.
 */
function repondre(page: Page, accepter: boolean): Promise<string> {
  return new Promise((resolve) => {
    page.once("dialog", (d) => {
      const message = d.message();
      void (accepter ? d.accept() : d.dismiss()).then(() => resolve(message));
    });
  });
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

  /* La boîte de confirmation n'arrive qu'APRÈS la réponse de l'import : on
   * attend qu'elle ait été traitée (`repondre`). Avec un simple `page.once`
   * non attendu, les deux contrôles du refus passaient à vide pendant que la
   * requête était encore en vol, et la boîte surgissait à l'étape suivante
   * (course vue le 2026-11-11 sur une machine chargée : « Cannot accept dialog
   * which is already handled »). */
  const importer = bloc.getByRole("button", { name: t("fr", "import.cta"), exact: true });

  // Refus de remplacer : le titre saisi reste, et rien n'annonce un import.
  await bloc.getByRole("textbox", { name: t("fr", "import.url"), exact: true }).fill("https://boutique.ht/sak-kwi");
  const refus = repondre(page, false);
  await importer.click();
  expect(await refus).toBe(t("fr", "import.replace"));
  await expect(importer).toBeEnabled();
  await expect(titre).toHaveValue("Mon titre à moi");
  await expect(bloc.getByRole("status")).toHaveCount(0);

  // Accord : le texte importé prend la place.
  const accord = repondre(page, true);
  await importer.click();
  await accord;
  await expect(titre).toHaveValue(FICHE.titre);

  // Refus du serveur : son message, traduit, s'affiche ; le formulaire ne change pas.
  await page.unroute("**/api/products/import");
  await simuler(page, { status: 502, corps: { error: t("fr", "api.import.unreachable") } });
  await importer.click();
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
