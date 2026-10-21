import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { t, type Lang } from "../lib/i18n";
import { publishDraftCopy } from "../lib/publish-draft-copy";
import { publishReviewKey } from "../lib/publish-draft";
import { KIND_PHYSICAL } from "../lib/product-kind";

// Vraie page et vrai POST ; seuls Auth/PostgREST/Storage sont simulés par le
// serveur local existant. Ceci ne prouve ni contraintes ni idempotence SQL.
const STUB = "http://127.0.0.1:15421";
const ACTOR = "22222222-2222-2222-2222-222222222222";
const OTHER = "11111111-1111-1111-1111-111111111111";
const PNG = readFileSync("e2e/fixtures/cover.png");
const form = (page: Page) => page.locator("main form");
const submit = (page: Page, lang: Lang = "fr") => form(page).getByRole("button", { name: t(lang, "sell.physical.draft"), exact: true });
const policy = (page: Page) => form(page).locator('input[type="checkbox"][required]');
const scenarioTitle = (label: string) => `Reprise physique ${label} ${test.info().workerIndex}-${test.info().retry}`;
const pageErrors = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  const errors: string[] = []; pageErrors.set(page, errors);
  page.on("pageerror", error => errors.push(error.message));
});
test.afterEach(async ({ page }) => {
  expect(pageErrors.get(page), "erreurs JavaScript, y compris hydratation").toEqual([]);
  await expect(page.locator("nextjs-portal, [data-nextjs-dialog-overlay], [data-nextjs-error-overlay]")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "aucun débordement horizontal").toBe(true);
});

async function session(page: Page, lang: Lang = "fr", account: "a" | "b" = "a") {
  const value = { access_token: account === "a" ? "vendeur-preparation-physical-recovery" : "physical-recovery-other", refresh_token: "fixture", token_type: "bearer",
    expires_at: 4102444800, expires_in: 3600,
    user: { id: account === "a" ? ACTOR : OTHER, aud: "authenticated", role: "authenticated" } };
  await page.context().addCookies([
    { name: "sb-127-auth-token", value: "base64-" + Buffer.from(JSON.stringify(value)).toString("base64url"), domain: "127.0.0.1", path: "/" },
    { name: "zabelie_lang", value: lang, domain: "127.0.0.1", path: "/" },
  ]);
}

async function settled(page: Page, lang: Lang = "fr") {
  await expect(page.getByRole("heading", { level: 1, name: t(lang, "sell.physical.title"), exact: true })).toBeVisible();
  // Une page rechargée peut d'abord montrer le HTML du formulaire désactivé,
  // avant que le marqueur de session décide entre saisie et vérification.
  await expect.poll(async () => (await page.getByText(publishDraftCopy(lang).uncertain, { exact: true }).isVisible())
    || await form(page).getByRole("textbox", { name: "Titre", exact: true }).isEditable().catch(() => false)).toBe(true);
}

async function fill(page: Page, title: string, attest = true) {
  await form(page).getByRole("textbox", { name: "Titre", exact: true }).fill(title);
  await form(page).getByRole("spinbutton", { name: /^Prix \(HTG\)/ }).fill("1500");
  await form(page).getByRole("spinbutton", { name: "Quantité en stock", exact: true }).fill("3");
  await form(page).getByRole("combobox", { name: "Catégorie", exact: true }).selectOption("wob");
  if (attest) await policy(page).check();
}

async function state(page: Page, title: string) {
  return (await page.request.get(`${STUB}/__physical-creations?title=${encodeURIComponent(title)}`)).json();
}

async function reviewMarker(page: Page) {
  return page.evaluate(key => {
    const stored = sessionStorage.getItem(key);
    return stored ? JSON.parse(stored).value : null;
  }, publishReviewKey(ACTOR, KIND_PHYSICAL));
}

async function captureAtTop(page: Page, name: string) {
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await page.screenshot({ path: test.info().outputPath(name), fullPage: true });
}

async function locked(page: Page, lang: Lang = "fr") {
  const copy = publishDraftCopy(lang);
  await expect(page.getByText(copy.uncertain, { exact: true })).toBeVisible();
  await expect(submit(page, lang)).toHaveCount(0);
  await expect(page.getByRole("link", { name: copy.checkProducts, exact: true })).toHaveAttribute("href", "/vendre#mes-produits");
  await expect(page.getByRole("button", { name: copy.resume, exact: true })).toBeVisible();
}

test("physique : un POST réellement créé puis perdu ne crée pas un second produit après reload", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await session(page);
  const title = scenarioTitle("réponse perdue mobile");
  const responses: { status: number; productId: string }[] = [];
  const bodies: Record<string, unknown>[] = [];
  let acknowledged = false;
  await page.route(url => url.pathname === "/api/products/physical", async route => {
    if (route.request().method() !== "POST") return route.continue();
    bodies.push(route.request().postDataJSON());
    if (acknowledged) return route.fulfill({ status: 400, json: { error: "Nouvel essai explicitement demandé" } });
    const response = await route.fetch(); const body = await response.json();
    responses.push({ status: response.status(), productId: body.productId });
    await route.abort("failed");
  });
  await page.goto("/vendre/physique"); await settled(page);
  await fill(page, title); await submit(page).click();
  await expect.poll(() => responses.length).toBe(1);
  expect(responses[0].status).toBe(200);
  await expect.poll(async () => (await state(page, title)).stocks.length).toBe(1);
  await page.reload(); await settled(page);
  // La contrepreuve sur l'ancien build clique le second envoi encore offert.
  // Le correctif doit masquer ce formulaire jusqu'à vérification humaine.
  if (await submit(page).count()) {
    await fill(page, title); await submit(page).click();
    await expect.poll(() => responses.length).toBe(2);
  }
  const saved = await state(page, title);
  console.log(JSON.stringify({ scenario: "POST traité puis réponse perdue", responses, productWrites: saved.products.length }));
  expect(saved.products).toHaveLength(1);
  expect(saved.extensions).toHaveLength(1); expect(saved.variants).toHaveLength(1);
  await locked(page);
  await captureAtTop(page, "creation-physique-incertaine-390.png");
  await page.getByRole("link", { name: publishDraftCopy("fr").checkProducts, exact: true }).click();
  await expect(page.locator(`#produit-${responses[0].productId}`)).toBeVisible();
  await page.goto("/vendre/physique"); await settled(page); await locked(page);
  await page.getByRole("button", { name: publishDraftCopy("fr").resume, exact: true }).click();
  await expect(form(page).getByRole("textbox", { name: "Titre", exact: true })).toBeEditable(); await expect(policy(page)).not.toBeChecked();
  expect(bodies).toHaveLength(1);
  await fill(page, "Reprise physique après vérification humaine", false);
  await submit(page).click(); expect(bodies).toHaveLength(1);
  await policy(page).check(); acknowledged = true; await submit(page).click();
  await expect(page.locator("main").getByRole("alert")).toHaveText("Nouvel essai explicitement demandé");
  expect(bodies).toHaveLength(2); expect(bodies[1].policyAccepted).toBe(true);
  expect((await state(page, title)).products).toHaveLength(1);
});

for (const [lang, status, malformed, width] of [
  ["ht", 500, false, 390], ["en", 422, false, 1280], ["es", 200, true, 1280],
] as const) {
  test(`physique : réponse ${malformed ? "200 malformée" : status} après création reste à vérifier (${lang})`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 }); await session(page, lang);
    const title = scenarioTitle(`indécidable ${lang}`); let posts = 0;
    await page.route(url => url.pathname === "/api/products/physical", async route => {
      if (route.request().method() !== "POST") return route.continue();
      posts++; const real = await route.fetch(); expect(real.status()).toBe(200);
      await route.fulfill({ status, json: malformed ? { ok: true, productId: "identifiant-invalide", slug: "reprise" } : { error: "Réponse après écriture possible" } });
    });
    await page.goto("/vendre/physique"); await settled(page, lang);
    await fill(page, title); await submit(page, lang).click(); await locked(page, lang);
    await page.reload(); await settled(page, lang); await locked(page, lang);
    expect(posts).toBe(1); expect((await state(page, title)).products).toHaveLength(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (lang === "es") await captureAtTop(page, "creation-physique-incertaine-1280-es.png");
  });
}

test("physique : les refus 400, 401, 403 et 429 permettent une correction sans nouvel envoi automatique", async ({ page }) => {
  await session(page); await page.setViewportSize({ width: 1280, height: 900 });
  const statuses = [400, 401, 403, 429]; let posts = 0;
  const title = scenarioTitle("refus explicite");
  await page.route(url => url.pathname === "/api/products/physical", async route => {
    if (route.request().method() !== "POST") return route.continue();
    const status = statuses[posts++]; await route.fulfill({ status, json: { error: `Refus avant création ${status}` } });
  });
  await page.goto("/vendre/physique"); await settled(page);
  for (const status of statuses) {
    await fill(page, title); await submit(page).click();
    await expect(page.locator("main").getByRole("alert")).toHaveText(`Refus avant création ${status}`);
    await expect(submit(page)).toBeEnabled(); await expect(form(page).getByRole("textbox", { name: "Titre", exact: true })).toBeEditable();
  }
  await page.reload(); await settled(page); await expect(form(page).getByRole("textbox", { name: "Titre", exact: true })).toBeEditable();
  expect(posts).toBe(4); expect((await state(page, title)).products).toHaveLength(0);
});

test("physique : après création confirmée, reprendre la photo conserve le même UUID sans recréer la fiche", async ({ page }) => {
  await session(page); await page.setViewportSize({ width: 390, height: 844 });
  const title = scenarioTitle("photo seulement"); const covers: string[] = []; let posts = 0;
  page.on("request", request => { if (new URL(request.url()).pathname === "/api/products/physical" && request.method() === "POST") posts++; });
  await page.route(url => url.pathname === "/api/products/cover", async route => {
    const body = route.request().postDataBuffer()?.toString() ?? "";
    covers.push(/name="productId"\r?\n\r?\n([^\r\n]+)/.exec(body)?.[1] ?? "");
    if (covers.length === 1) return route.fulfill({ status: 503, json: { error: "Photo non confirmée" } });
    return route.continue();
  });
  await page.goto("/vendre/physique"); await settled(page); await fill(page, title);
  await form(page).locator('input[type="file"]').setInputFiles({ name: "photo.png", mimeType: "image/png", buffer: PNG });
  await expect(submit(page)).toBeEnabled(); await submit(page).click();
  await expect(page.getByRole("heading", { name: t("fr", "sell.physical.saved"), exact: true })).toBeVisible();
  await expect(page.locator("main").getByRole("alert")).toHaveText(t("fr", "sell.physical.photo.failed"));
  expect(await reviewMarker(page)).toBe(true);
  await expect(page.getByRole("button", { name: publishDraftCopy("fr").resume, exact: true })).toHaveCount(0);
  await expect(submit(page)).toHaveCount(0);
  await page.getByRole("button", { name: t("fr", "sell.physical.photo.retry"), exact: true }).click();
  await expect(page).toHaveURL(/\/vendre#produit-[0-9a-f-]{36}$/);
  const saved = await state(page, title);
  expect(posts).toBe(1); expect(saved.products).toHaveLength(1);
  expect(covers).toEqual([saved.products[0].id, saved.products[0].id]);
  expect(saved.uploads).toHaveLength(1);
  expect(await reviewMarker(page)).toBe(null);
});

test("physique : un formulaire A refusé après connexion B ne crée aucune fiche et B ne reprend aucune saisie", async ({ page }) => {
  await session(page); await page.setViewportSize({ width: 1280, height: 900 });
  const title = scenarioTitle("ancien compte privé");
  await page.goto("/vendre/physique"); await settled(page); await fill(page, title);
  await session(page, "fr", "b");
  const response = page.waitForResponse(response => new URL(response.url()).pathname === "/api/products/physical" && response.request().method() === "POST");
  await submit(page).click(); const refused = await response;
  expect(refused.status()).toBe(403); expect(refused.request().postDataJSON().expectedActorId).toBe(ACTOR);
  await expect(submit(page)).toBeEnabled(); expect((await state(page, title)).products).toHaveLength(0);
  await page.reload(); await settled(page);
  await expect(form(page).getByRole("textbox", { name: "Titre", exact: true })).toHaveValue("");
  await expect(policy(page)).not.toBeChecked();
});

test("physique : une réponse tardive après démontage ne supprime pas la vérification du compte A", async ({ page }) => {
  await session(page); await page.setViewportSize({ width: 1280, height: 900 });
  const title = scenarioTitle("réponse tardive A");
  await page.goto("/vendre/physique"); await settled(page); await fill(page, title);
  await page.evaluate(() => {
    document.documentElement.dataset.physicalRecoveryDocument = "same-document";
    const original = window.fetch.bind(window);
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    const pending = { committed: false, release };
    (window as unknown as { physicalPending: typeof pending }).physicalPending = pending;
    window.fetch = async (...args) => {
      const response = await original(...args);
      const target = args[0] instanceof Request ? args[0].url : String(args[0]);
      if (new URL(target, location.href).pathname === "/api/products/physical" && args[1]?.method === "POST") {
        await response.clone().arrayBuffer(); pending.committed = true; await held;
      }
      return response;
    };
  });
  try {
  const finished = page.waitForEvent("requestfinished", request => new URL(request.url()).pathname === "/api/products/physical" && request.method() === "POST");
  await submit(page).click(); await finished;
  await page.waitForFunction(() => (window as unknown as { physicalPending: { committed: boolean } }).physicalPending.committed);
  await session(page, "fr", "b");
  await page.getByRole("link", { name: t("fr", "sell.physical.digital"), exact: true }).click();
  await expect(page).toHaveURL(/\/vendre$/);
  expect(await page.evaluate(() => document.documentElement.dataset.physicalRecoveryDocument), "la navigation doit démonter sans recharger le document").toBe("same-document");
  await page.evaluate(() => (window as unknown as { physicalPending: { release(): void } }).physicalPending.release());
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await expect(page).toHaveURL(/\/vendre$/);
  await session(page); await page.goto("/vendre/physique"); await settled(page); await locked(page);
  expect((await state(page, title)).products).toHaveLength(1);
  } finally {
    await page.evaluate(() => (window as unknown as { physicalPending?: { release(): void } }).physicalPending?.release());
  }
});

test("physique : stockage refusé annonce la limite, laisse saisir et ne renvoie rien au reload", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "sessionStorage", { configurable: true, get() { throw new DOMException("Storage unavailable", "SecurityError"); } });
  });
  await session(page); await page.setViewportSize({ width: 390, height: 844 });
  let posts = 0;
  await page.route(url => url.pathname === "/api/products/physical", async route => {
    if (route.request().method() !== "POST") return route.continue(); posts++; await route.abort("failed");
  });
  await page.goto("/vendre/physique"); await settled(page);
  await expect(page.getByText(publishDraftCopy("fr").physicalUnavailable, { exact: true })).toBeVisible();
  await fill(page, "Reprise physique mémoire seule"); await submit(page).click(); await locked(page);
  await page.reload(); await settled(page); await expect(form(page).getByRole("textbox", { name: "Titre", exact: true })).toBeEditable();
  await expect(page.getByText(publishDraftCopy("fr").physicalUnavailable, { exact: true })).toBeVisible();
  await expect(form(page).getByRole("textbox", { name: "Titre", exact: true })).toHaveValue(""); expect(posts).toBe(1);
});
