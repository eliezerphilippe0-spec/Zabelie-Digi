import { test, expect, type Page, type Route } from "@playwright/test";
import { t } from "../lib/i18n";

// Même serveur local et mêmes comptes que les parcours vendeur existants.
// Seul le POST same-origin est simulé : aucune création ni aucun paiement réel.
const SAVED = "Brouillon conservé dans cet onglet pendant 30 minutes.";
const UNAVAILABLE = "Le stockage de cet onglet est indisponible. Gardez cette page ouverte pour conserver votre saisie.";
const UNCERTAIN = "La création doit être vérifiée. Consultez vos produits avant de recommencer.";
const ACKNOWLEDGE = "J’ai vérifié mes produits : reprendre la saisie";
type Kind = "numerique" | "prestation";
const pageErrors = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on("pageerror", (error) => errors.push(error.message));
});

test.afterEach(async ({ page }) => {
  // Aucune erreur n'est filtrée, notamment les erreurs d'hydratation React.
  expect(pageErrors.get(page), "erreurs JavaScript de la page").toEqual([]);
  await expect(page.locator("nextjs-portal, [data-nextjs-dialog-overlay], [data-nextjs-error-overlay]")).toHaveCount(0);
});

const region = (page: Page) => page.locator("#formulaire");
const title = (page: Page) => region(page).getByRole("textbox", { name: t("fr", "publish.title.ph"), exact: true });
const price = (page: Page) => region(page).getByRole("spinbutton", { name: t("fr", "publish.price.ph"), exact: true });
const policy = (page: Page) => region(page).getByRole("checkbox", { name: /^Je confirme que ce produit respecte les règles de vente de Zabelie\./ });
const submit = (page: Page) => region(page).getByRole("button", { name: t("fr", "publish.submit"), exact: true });

async function session(page: Page, account: "a" | "b" = "a") {
  const value = {
    access_token: account === "a" ? "vendeur-preparation-brouillon-publication" : "brouillon-publication-autre-compte",
    refresh_token: "test", token_type: "bearer", expires_at: 4102444800, expires_in: 3600,
    user: { id: account === "a" ? "22222222-2222-2222-2222-222222222222" : "11111111-1111-1111-1111-111111111111", aud: "authenticated", role: "authenticated" },
  };
  await page.context().addCookies([
    { name: "sb-127-auth-token", value: "base64-" + Buffer.from(JSON.stringify(value)).toString("base64url"), domain: "127.0.0.1", path: "/" },
    { name: "zabelie_lang", value: "fr", domain: "127.0.0.1", path: "/" },
  ]);
  await page.setViewportSize({ width: 390, height: 844 });
}

async function ready(page: Page, kind: Kind, storage = true) {
  await expect(page).toHaveURL(new RegExp(`/vendre\\?nouveau=${kind}#formulaire$`));
  await expect(region(page).getByRole("heading", { name: kind === "prestation" ? "Nouveau service" : "Nouveau fichier numérique", exact: true })).toBeVisible();
  if (storage) await expect(region(page).getByRole("status").filter({ hasText: SAVED })).toBeVisible();
  else await expect(region(page).getByText(UNAVAILABLE, { exact: true })).toBeVisible();
  await expect(title(page)).toBeEditable();
}

async function open(page: Page, kind: Kind, storage = true) {
  await page.goto(`/vendre?nouveau=${kind}#formulaire`);
  await ready(page, kind, storage);
}

async function fill(page: Page, kind: Kind, value: string) {
  await title(page).fill(value);
  await region(page).getByRole("combobox", { name: t("fr", "publish.category.aria"), exact: true }).selectOption("Digital & services");
  await region(page).getByRole("combobox", { name: t("fr", "publish.subcategory.aria"), exact: true }).selectOption("services-design");
  await price(page).fill(kind === "numerique" ? "0" : "2500");
  await region(page).getByRole("textbox", { name: t("fr", "publish.description.ph"), exact: true }).fill(`Description de ${value}`);
  if (kind === "prestation") {
    await region(page).getByRole("spinbutton", { name: t("fr", "publish.deliveryDays.ph"), exact: true }).fill("2");
    await region(page).getByRole("textbox", { name: t("fr", "product.includes"), exact: true }).fill("Une proposition\nUne révision");
  }
}

async function fields(page: Page, kind: Kind, value: string) {
  await expect(title(page)).toHaveValue(value);
  await expect(region(page).getByRole("combobox", { name: t("fr", "publish.category.aria"), exact: true })).toHaveValue("Digital & services");
  await expect(region(page).getByRole("combobox", { name: t("fr", "publish.subcategory.aria"), exact: true })).toHaveValue("services-design");
  await expect(price(page)).toHaveValue(kind === "numerique" ? "0" : "2500");
  await expect(region(page).getByRole("textbox", { name: t("fr", "publish.description.ph"), exact: true })).toHaveValue(`Description de ${value}`);
  if (kind === "prestation") {
    await expect(region(page).getByRole("spinbutton", { name: t("fr", "publish.deliveryDays.ph"), exact: true })).toHaveValue("2");
    await expect(region(page).getByRole("textbox", { name: t("fr", "product.includes"), exact: true })).toHaveValue("Une proposition\nUne révision");
  }
}

async function creates(page: Page, respond: (route: Route, count: number) => Promise<void>) {
  const bodies: Record<string, unknown>[] = [];
  await page.route((url) => url.pathname === "/api/products", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    bodies.push(route.request().postDataJSON() as Record<string, unknown>);
    await respond(route, bodies.length);
  });
  return bodies;
}

async function storedKeys(page: Page, value: string) {
  return page.evaluate((text) => Object.keys(sessionStorage).filter((key) => sessionStorage.getItem(key)?.includes(text)), value);
}

for (const kind of ["numerique", "prestation"] as const) {
  test(`brouillon ${kind} : reprise après reload, attestation oubliée et aucun envoi automatique`, async ({ page }) => {
    await session(page);
    const posts = await creates(page, (route) => route.fulfill({ status: 400, json: { error: "Envoi inattendu" } }));
    await open(page, kind);
    const value = `Publication reprise ${kind}`;
    await fill(page, kind, value);
    await policy(page).check();
    await expect.poll(() => storedKeys(page, value)).toHaveLength(1);
    await page.reload();
    await ready(page, kind);
    await fields(page, kind, value);
    await expect(policy(page)).not.toBeChecked();
    expect(posts).toHaveLength(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page).toHaveTitle(t("fr", "meta.vendre.title"));
    if (kind === "prestation") {
      await page.screenshot({ path: test.info().outputPath("brouillon-service-repris-390.png"), fullPage: true });
      await page.setViewportSize({ width: 1280, height: 900 });
      await fields(page, kind, value);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: test.info().outputPath("brouillon-service-repris-1280.png"), fullPage: true });
    } else {
      // maxLength n'agit pas sur type=number : une saisie démesurée ne doit
      // pas rendre tout le brouillon invalide et effacer le titre au reload.
      await price(page).fill("9".repeat(90));
      const boundedPrice = await price(page).inputValue();
      expect(boundedPrice.length).toBeLessThanOrEqual(64);
      expect(boundedPrice).not.toBe("");
      await page.reload();
      await ready(page, kind);
      await expect(title(page)).toHaveValue(value);
      await expect(price(page)).toHaveValue(boundedPrice);
      await expect(policy(page)).not.toBeChecked();
      expect(posts).toHaveLength(0);
    }
  });
}

test("les brouillons fichier et service restent séparés pendant les changements de type", async ({ page }) => {
  await session(page);
  const posts = await creates(page, (route) => route.fulfill({ status: 400, json: { error: "Envoi inattendu" } }));
  await open(page, "numerique");
  await fill(page, "numerique", "Fichier indépendant");
  await policy(page).check();
  await region(page).getByRole("link", { name: "Changer de type", exact: true }).click();
  await page.locator("#nouveau").getByRole("link", { name: /^Service\b/ }).click();
  await ready(page, "prestation");
  await expect(title(page)).toHaveValue("");
  await expect(policy(page)).not.toBeChecked();
  await fill(page, "prestation", "Service indépendant");
  await region(page).getByRole("link", { name: "Changer de type", exact: true }).click();
  await page.locator("#nouveau").getByRole("link", { name: /^Fichier numérique\b/ }).click();
  await ready(page, "numerique");
  await fields(page, "numerique", "Fichier indépendant");
  await expect(policy(page)).not.toBeChecked();
  await open(page, "prestation");
  await fields(page, "prestation", "Service indépendant");
  expect(posts).toHaveLength(0);
});

test("un autre compte ne reçoit aucune saisie et le changement purge les brouillons du précédent", async ({ page }) => {
  await session(page);
  await open(page, "numerique");
  await fill(page, "numerique", "Saisie privée du compte A");
  await open(page, "prestation");
  await fill(page, "prestation", "Service privé du compte A");
  await session(page, "b");
  await page.reload();
  await ready(page, "prestation");
  await expect(title(page)).toHaveValue("");
  expect(await storedKeys(page, "privée du compte A")).toEqual([]);
  expect(await storedKeys(page, "privé du compte A")).toEqual([]);
  // Le compte B a sa propre taxonomie de fixture ; ce scénario vérifie
  // l'isolation des saisies, sans dépendre de ses rayons de publication.
  await title(page).fill("Saisie privée du compte B");
  await session(page, "a");
  await page.reload();
  await ready(page, "prestation");
  await expect(title(page)).toHaveValue("");
  await open(page, "numerique");
  await expect(title(page)).toHaveValue("");
  expect(await storedKeys(page, "privée du compte B")).toEqual([]);
});

test("un stockage indisponible est annoncé et laisse la saisie utilisable", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "sessionStorage", { configurable: true, get() { throw new DOMException("Storage unavailable", "SecurityError"); } });
  });
  await session(page);
  await open(page, "prestation", false);
  await fill(page, "prestation", "Service gardé en mémoire");
  await fields(page, "prestation", "Service gardé en mémoire");
  await expect(region(page).getByText(SAVED, { exact: true })).toHaveCount(0);
  await page.reload();
  await ready(page, "prestation", false);
  await expect(title(page)).toHaveValue("");
});

test("les brouillons expirés ou corrompus ne restaurent aucune saisie ni attestation", async ({ page }) => {
  await session(page);
  for (const invalid of ["expired", "corrupt"] as const) {
    await open(page, "numerique");
    const value = `Brouillon invalide ${invalid}`;
    await fill(page, "numerique", value);
    await policy(page).check();
    await expect.poll(() => storedKeys(page, value)).toHaveLength(1);
    const [key] = await storedKeys(page, value);
    await page.evaluate(({ storageKey, invalidity }) => {
      const raw = sessionStorage.getItem(storageKey)!;
      sessionStorage.setItem(storageKey, invalidity === "corrupt" ? "{json-incomplet" : JSON.stringify({ ...JSON.parse(raw), at: Date.now() - 31 * 60_000 }));
    }, { storageKey: key, invalidity: invalid });
    await page.reload();
    await ready(page, "numerique");
    await expect(title(page)).toHaveValue("");
    await expect(price(page)).toHaveValue("");
    await expect(policy(page)).not.toBeChecked();
    expect(await storedKeys(page, value)).toEqual([]);
  }
});

test("un refus 400 conserve le brouillon éditable après rechargement", async ({ page }) => {
  await session(page);
  const posts = await creates(page, (route) => route.fulfill({ status: 400, json: { error: "Publication refusée pour cet essai" } }));
  await open(page, "prestation");
  await fill(page, "prestation", "Service refusé à corriger");
  await policy(page).check();
  await submit(page).click();
  await expect(region(page).getByRole("alert")).toContainText("Publication refusée pour cet essai");
  await expect(title(page)).toBeEditable();
  expect(posts).toHaveLength(1);
  expect(posts[0]).toMatchObject({ kind: "service", title: "Service refusé à corriger", policyAccepted: true, deliveryDays: 2 });
  await page.reload();
  await ready(page, "prestation");
  await fields(page, "prestation", "Service refusé à corriger");
  await expect(policy(page)).not.toBeChecked();
  await expect(region(page).getByText(UNCERTAIN, { exact: true })).toHaveCount(0);
  expect(posts).toHaveLength(1);
});

test("une coupure pendant la création survit au reload et demande une vérification avant tout nouveau clic", async ({ page }) => {
  await session(page);
  const posts = await creates(page, (route, count) => count === 1 ? route.abort("failed") : route.fulfill({ status: 400, json: { error: "Nouvel essai explicitement demandé" } }));
  await open(page, "numerique");
  await fill(page, "numerique", "Création à rapprocher");
  await policy(page).check();
  await submit(page).click();
  await expect(region(page).getByRole("alert").filter({ hasText: UNCERTAIN })).toBeVisible();
  await expect(submit(page)).toBeDisabled();
  expect(posts).toHaveLength(1);
  await page.reload();
  await expect(region(page).getByRole("alert").filter({ hasText: UNCERTAIN })).toBeVisible();
  await expect(title(page)).toHaveValue("Création à rapprocher");
  await expect(policy(page)).not.toBeChecked();
  await expect(submit(page)).toBeDisabled();
  await expect(region(page).getByRole("link", { name: "Vérifier mes produits", exact: true })).toHaveAttribute("href", /^\/vendre(?:#mes-produits)?$/);
  expect(posts).toHaveLength(1);
  // Le texte privé expire, mais le doute sur une création déjà transmise
  // n'expire pas avec lui. Avancer la date ne déclenche aucun nouvel envoi.
  await page.clock.setFixedTime(await page.evaluate(() => Date.now() + 31 * 60_000));
  await page.reload();
  await expect(region(page).getByRole("alert").filter({ hasText: UNCERTAIN })).toBeVisible();
  await expect(title(page)).toHaveValue("");
  await expect(price(page)).toHaveValue("");
  await expect(policy(page)).not.toBeChecked();
  await expect(submit(page)).toBeDisabled();
  expect(posts).toHaveLength(1);
  await page.screenshot({ path: test.info().outputPath("brouillon-creation-a-verifier-390.png"), fullPage: true });
  await region(page).getByRole("button", { name: ACKNOWLEDGE, exact: true }).click();
  expect(posts).toHaveLength(1);
  await expect(title(page)).toBeEditable();
  await expect(policy(page)).not.toBeChecked();
  await fill(page, "numerique", "Saisie après vérification humaine");
  await policy(page).check();
  await submit(page).click();
  await expect(region(page).getByRole("alert")).toContainText("Nouvel essai explicitement demandé");
  expect(posts).toHaveLength(2);
});

for (const [label, slug] of [
  ["titre emoji", "-abc12"],
  ["titre tronqué", "a".repeat(59) + "--abc12"],
] as const) {
  test(`une réponse de succès complète efface le brouillon avant le retour aux produits (${label})`, async ({ page }) => {
    await session(page);
    const posts = await creates(page, (route) => route.fulfill({ json: { slug, status: "draft" } }));
    await open(page, "numerique");
    await fill(page, "numerique", "Brouillon correctement enregistré");
    await policy(page).check();
    await submit(page).click();
    await expect(page).toHaveURL(/\/vendre$/);
    expect(posts).toHaveLength(1);
    expect(await storedKeys(page, "Brouillon correctement enregistré")).toEqual([]);
    await open(page, "numerique");
    await expect(title(page)).toHaveValue("");
    await expect(price(page)).toHaveValue("");
    await expect(policy(page)).not.toBeChecked();
    expect(posts).toHaveLength(1);
  });
}

test("effacer un brouillon réinitialise les champs et l’attestation sans créer de produit", async ({ page }) => {
  await session(page);
  const posts = await creates(page, (route) => route.fulfill({ status: 400, json: { error: "Envoi inattendu" } }));
  await open(page, "prestation");
  await fill(page, "prestation", "Brouillon à effacer");
  await policy(page).check();
  page.once("dialog", (dialog) => dialog.dismiss());
  await region(page).getByRole("button", { name: "Effacer le brouillon", exact: true }).click();
  await fields(page, "prestation", "Brouillon à effacer");
  await expect(policy(page)).toBeChecked();
  page.once("dialog", (dialog) => dialog.accept());
  await region(page).getByRole("button", { name: "Effacer le brouillon", exact: true }).click();
  await expect(title(page)).toHaveValue("");
  await expect(price(page)).toHaveValue("");
  await expect(policy(page)).not.toBeChecked();
  await page.reload();
  await ready(page, "prestation");
  await expect(title(page)).toHaveValue("");
  expect(await storedKeys(page, "Brouillon à effacer")).toEqual([]);
  expect(posts).toHaveLength(0);
});
