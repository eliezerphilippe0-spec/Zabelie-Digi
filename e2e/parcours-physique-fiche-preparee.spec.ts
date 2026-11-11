import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { t } from "../lib/i18n";

/**
 * FICHE PRÉPARÉE PAR UN ASSISTANT, de bout en bout (lot 3b, 2026-11-11).
 *
 * Les VRAIES routes, contre le faux Supabase des e2e : le vendeur crée une clé
 * qui peut préparer des fiches ; un appelant sans cookie (comme le ferait le
 * serveur MCP) dépose une fiche avec cette clé ; le vendeur ouvre l'adresse
 * rendue et retrouve le texte dans SON formulaire, où rien n'est rempli sans
 * son geste et où la politique reste à cocher par lui.
 *
 * Ce que ce test ne prouve PAS : la RLS, le plafond et le contenu figé de la
 * base (`supabase/tests/fiches_preparees.test.sql`), ni un assistant hébergé réel.
 *
 * Projet `physique` : `/vendre` exige une session (faux Supabase des e2e).
 */
const ACTOR = "22222222-2222-2222-2222-222222222222";

async function session(page: Page) {
  const value = { access_token: "vendeur-preparation-physical-recovery", refresh_token: "fixture", token_type: "bearer", expires_at: 4102444800, expires_in: 3600,
    user: { id: ACTOR, aud: "authenticated", role: "authenticated" } };
  await page.context().addCookies([
    { name: "sb-127-auth-token", value: "base64-" + Buffer.from(JSON.stringify(value)).toString("base64url"), domain: "127.0.0.1", path: "/" },
    { name: "zabelie_lang", value: "fr", domain: "127.0.0.1", path: "/" },
  ]);
}

/** Crée une clé comme le fait l'écran des clés, et rend de quoi la révoquer. */
async function creerCle(page: Page, nom: string, prepare: boolean) {
  const res = await page.request.post("/api/account/api-keys", { data: { name: nom, prepare } });
  expect(res.status()).toBe(201);
  const { key, id, scopes } = await res.json();
  return { key: key as string, id: id as string, scopes: scopes as string[] };
}

/** Un appel SANS cookie, comme un serveur tiers : seule la clé compte. */
const preparer = (api: APIRequestContext, cle: string, corps: unknown) =>
  api.post("/api/v1/seller/prepare_product", { data: corps, headers: { Authorization: `Bearer ${cle}` } });

test("une clé ordinaire ne peut pas préparer de fiche ; une clé qui l'a choisi, si", async ({ page, request }) => {
  await session(page);
  const ordinaire = await creerCle(page, "Mon site", false);
  expect(ordinaire.scopes).not.toContain("products:prepare");
  const refus = await preparer(request, ordinaire.key, { kind: "physical", title: "Sandal kwi" });
  expect(refus.status()).toBe(403);
  expect((await refus.json()).code).toBe("forbidden");

  const assistant = await creerCle(page, "Assistant e2e", true);
  expect(assistant.scopes).toContain("products:prepare");
  const depot = await preparer(request, assistant.key, { kind: "physical", title: "Sandal kwi", priceHtg: 1500 });
  expect(depot.status()).toBe(200);
  const corps = await depot.json();
  expect(corps.type).toBe("prepared_product");
  expect(corps.published).toBe(false);
  expect(new URL(corps.url).pathname + new URL(corps.url).search).toBe(`/vendre/physique?preparee=${corps.id}`);
  expect(depot.headers()["access-control-allow-origin"]).toBeUndefined();

  // Entrée fermée : un assistant ne peut ni cocher la politique, ni choisir un statut.
  expect((await preparer(request, assistant.key, { kind: "physical", title: "x", policyAccepted: true })).status()).toBe(400);
  expect((await preparer(request, assistant.key, { kind: "physical", title: "x", status: "published" })).status()).toBe(400);
  expect((await preparer(request, assistant.key, { kind: "physical", title: "x", priceHtg: -5 })).status()).toBe(400);

  for (const c of [ordinaire, assistant]) expect((await page.request.delete(`/api/account/api-keys/${c.id}`)).status()).toBe(200);
  // Clé révoquée : plus aucun dépôt.
  expect((await preparer(request, assistant.key, { kind: "physical", title: "Sandal kwi" })).status()).toBe(401);
});

test("article physique : le vendeur ouvre l'adresse, reprend le texte, et rien n'est rempli sans lui", async ({ page, request }) => {
  await session(page);
  const cle = await creerCle(page, "Assistant boutique", true);
  const depot = await (await preparer(request, cle.key, {
    kind: "physical", title: "<b>Sak kwi</b> fèt alamen", description: "<p>Sak solid pou vandè.</p><p>Koulè natirèl.</p>", priceHtg: 2500,
  })).json();

  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto(new URL(depot.url).pathname + new URL(depot.url).search);
  const bloc = page.locator("[data-fiche-preparee]");
  await expect(bloc.getByText(t("fr", "prepared.hint").replace("{key}", "Assistant boutique"), { exact: true })).toBeVisible();
  // Le balisage envoyé par l'assistant est arrivé en texte.
  await expect(bloc.getByText("Sak kwi fèt alamen", { exact: true })).toBeVisible();
  await expect(bloc.getByText(/^Prix proposé : 2\s?500/u)).toBeVisible();

  // Avant le geste du vendeur : le formulaire est vide.
  const titre = page.getByRole("textbox", { name: "Titre", exact: true });
  const prix = page.getByRole("spinbutton", { name: /^Prix \(HTG\)/ });
  await expect(titre).toHaveValue("");
  await expect(prix).toHaveValue("");

  const reprise = page.waitForResponse((r) => r.url().endsWith(`/api/account/fiches-preparees/${depot.id}/reprise`) && r.request().method() === "POST");
  await bloc.getByRole("button", { name: t("fr", "prepared.cta"), exact: true }).click();
  expect((await reprise).status()).toBe(200);

  await expect(titre).toHaveValue("Sak kwi fèt alamen");
  await expect(page.locator("main form textarea").first()).toHaveValue("Sak solid pou vandè.\nKoulè natirèl.");
  await expect(prix).toHaveValue("2500");
  await expect(bloc.getByRole("status")).toHaveText(t("fr", "prepared.done"));
  // Ce que l'assistant ne touche pas : la quantité, et l'acceptation de la politique.
  await expect(page.getByRole("spinbutton", { name: "Quantité en stock", exact: true })).toHaveValue("");
  for (const caseACocher of await page.locator("main form input[type=checkbox][required]").all()) await expect(caseACocher).not.toBeChecked();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  // Rouverte, la fiche dit qu'elle a déjà été reprise, et reste reprenable.
  await page.reload();
  await expect(page.locator("[data-fiche-preparee]").getByText(t("fr", "prepared.already"), { exact: true })).toBeVisible();
  expect((await page.request.delete(`/api/account/api-keys/${cle.id}`)).status()).toBe(200);
});

test("un prix déjà saisi n'est pas écrasé, et une saisie n'est remplacée qu'avec l'accord du vendeur", async ({ page, request }) => {
  await session(page);
  const cle = await creerCle(page, "Assistant prix", true);
  const depot = await (await preparer(request, cle.key, { kind: "physical", title: "Sandal kwi", priceHtg: 900 })).json();
  await page.goto(new URL(depot.url).pathname + new URL(depot.url).search);
  const bloc = page.locator("[data-fiche-preparee]");
  const titre = page.getByRole("textbox", { name: "Titre", exact: true });
  const prix = page.getByRole("spinbutton", { name: /^Prix \(HTG\)/ });
  await titre.fill("Mon titre à moi");
  await prix.fill("1200");

  page.once("dialog", (d) => { expect(d.message()).toBe(t("fr", "import.replace")); void d.dismiss(); });
  await bloc.getByRole("button", { name: t("fr", "prepared.cta"), exact: true }).click();
  await expect(titre).toHaveValue("Mon titre à moi");
  await expect(bloc.getByRole("status")).toHaveCount(0);

  page.once("dialog", (d) => void d.accept());
  await bloc.getByRole("button", { name: t("fr", "prepared.cta"), exact: true }).click();
  await expect(titre).toHaveValue("Sandal kwi");
  await expect(prix).toHaveValue("1200");
  expect((await page.request.delete(`/api/account/api-keys/${cle.id}`)).status()).toBe(200);
});

test("fichier : l'adresse ouvre le bon formulaire, même tapée sur le mauvais ; une fiche inconnue se dit", async ({ page, request }) => {
  await session(page);
  const cle = await creerCle(page, "Assistant fichier", true);
  const depot = await (await preparer(request, cle.key, { kind: "fichier", title: "Gid pou vann sou entènèt", description: "Yon PDF 40 paj.", priceHtg: 500 })).json();
  expect(new URL(depot.url).pathname + new URL(depot.url).search).toBe(`/vendre?nouveau=numerique&preparee=${depot.id}`);

  // Ouverte sur le formulaire PHYSIQUE, la fiche renvoie vers celui du fichier.
  await page.goto(`/vendre/physique?preparee=${depot.id}`);
  await expect(page).toHaveURL(new RegExp(`/vendre\\?nouveau=numerique&preparee=${depot.id}`));
  const bloc = page.locator("[data-fiche-preparee]");
  await expect(bloc.getByText("Gid pou vann sou entènèt", { exact: true })).toBeVisible();
  await bloc.getByRole("button", { name: t("fr", "prepared.cta"), exact: true }).click();
  await expect(page.locator("#formulaire").getByRole("textbox", { name: t("fr", "publish.title.ph"), exact: true })).toHaveValue("Gid pou vann sou entènèt");
  await expect(page.locator("#formulaire").getByRole("spinbutton", { name: t("fr", "publish.price.ph"), exact: true })).toHaveValue("500");
  await expect(page.locator("#formulaire input[type=checkbox][required]")).not.toBeChecked();

  // Un identifiant qui n'existe pas (ou d'un autre vendeur) : un message, et le formulaire reste utilisable.
  await page.goto("/vendre/physique?preparee=99999999-9999-4999-8999-999999999999");
  await expect(page.getByRole("alert").filter({ hasText: t("fr", "prepared.missing") })).toBeVisible();
  await expect(page.locator("[data-fiche-preparee]")).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Titre", exact: true })).toBeVisible();
  expect((await page.request.delete(`/api/account/api-keys/${cle.id}`)).status()).toBe(200);
});

test("écran des clés : la case est décochée d'office, et la clé qui prépare le dit dans la liste", async ({ page }) => {
  const sessionCles = {
    access_token: "cles-api", refresh_token: "rafraichissement-de-test", token_type: "bearer", expires_in: 3600, expires_at: 4102444800,
    user: { id: "11111111-1111-1111-1111-111111111111", aud: "authenticated", role: "authenticated", email: "achte@example.ht", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" },
  };
  await page.context().addCookies([
    { name: "sb-127-auth-token", value: "base64-" + Buffer.from(JSON.stringify(sessionCles), "utf8").toString("base64url"), domain: "127.0.0.1", path: "/" },
    { name: "zabelie_lang", value: "fr", domain: "127.0.0.1", path: "/" },
  ]);
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/tableau-de-bord/api", { waitUntil: "networkidle" });
  const formulaire = page.locator("main form").first();
  const caseAssistant = formulaire.getByRole("checkbox", { name: t("fr", "apikeys.prepare"), exact: true });
  await expect(caseAssistant).not.toBeChecked();
  await expect(formulaire.getByText(t("fr", "apikeys.prepare.hint"), { exact: true })).toBeVisible();

  await formulaire.getByRole("textbox").fill("Assistant écran");
  await caseAssistant.check();
  await formulaire.locator("button[type=submit]").click();
  await expect(page.locator('[role="status"] code')).toHaveText(/^zb_live_[A-Za-z0-9_-]{43}$/);
  const ligne = page.locator("main li", { hasText: "Assistant écran" });
  await expect(ligne.getByText(t("fr", "apikeys.prepare.badge"), { exact: true })).toBeVisible();
  // Après une création, la case retombe : la clé suivante n'hérite pas du choix.
  await expect(page.locator("main form").first().getByRole("checkbox")).not.toBeChecked();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  page.once("dialog", (d) => d.accept());
  await ligne.getByRole("button").click();
  await expect(ligne.getByRole("button")).toHaveCount(0);
});
