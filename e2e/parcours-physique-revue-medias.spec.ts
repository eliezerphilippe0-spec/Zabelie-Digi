import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

/** Vraie page + vraies routes, avec E/S locales simulées. Les triggers et les
 * courses ne sont pas validés par cette doublure : la CI PostgreSQL les exerce. */
const STUB = "http://127.0.0.1:15421";
const names = ["add", "photo", "video", "cover", "confirm", "archived"] as const;
type Scenario = typeof names[number];
const idFor = (name: Scenario) => `f1520000-0000-4000-8000-${String(names.indexOf(name) + 1).padStart(12, "0")}`;
const png = readFileSync("e2e/fixtures/cover.png");

async function prepare(page: Page, name: Scenario) {
  const reset = await page.request.post(`${STUB}/__media-review/${name}/reset`);
  expect(reset.ok()).toBe(true);
  const session = {
    access_token: `vendeur-preparation-media-${name}`, refresh_token: "fixture", token_type: "bearer",
    expires_at: 4102444800, expires_in: 3600,
    user: { id: "22222222-2222-2222-2222-222222222222", aud: "authenticated", role: "authenticated" },
  };
  await page.context().addCookies([
    { name: "sb-127-auth-token", value: "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url"), domain: "127.0.0.1", path: "/" },
    { name: "zabelie_lang", value: "fr", domain: "127.0.0.1", path: "/" },
  ]);
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto(name === "archived" ? "/vendre?type=archivees#mes-produits" : "/vendre#mes-produits");
  return page.locator(`#produit-${idFor(name)}`);
}

function gallery(page: Page, name: Scenario) {
  return page.locator(`#produit-${idFor(name)} details`).filter({ has: page.locator("summary", { hasText: /^Photos \(\d\/\d\)$/ }) });
}

async function expectDraft(page: Page, name: Scenario) {
  const card = page.locator(`#produit-${idFor(name)}`);
  await expect(card.getByText("En attente de revue", { exact: true })).toBeVisible();
  await expect(card.getByRole("link", { name: `Revue média ${name}`, exact: true })).toHaveCount(0);
  await expect(card.getByText(/cette fiche en brouillon pour une nouvelle revue/)).toHaveCount(0);
  await expect(card.locator("label", { hasText: "Remplacer la photo principale" })).toBeVisible();
  const publicResponse = await page.request.get(`/produit/media-review-${name}`);
  expect(publicResponse.status()).toBe(404);
}

test("ajouter une photo à une fiche publiée actualise le statut et retire son lien public", async ({ page }) => {
  const card = await prepare(page, "add");
  await expect(card.getByRole("link", { name: "Revue média add", exact: true })).toBeVisible();
  await expect(card.getByText(/cette fiche en brouillon pour une nouvelle revue/)).toBeVisible();
  const photos = gallery(page, "add");
  await photos.locator("summary").click();
  await photos.locator('input[type="file"][accept^="image/"]').setInputFiles({ name: "photo.png", mimeType: "image/png", buffer: png });
  await expect(photos.locator("img")).toHaveCount(1);
  await expectDraft(page, "add");
  await page.reload();
  await gallery(page, "add").locator("summary").click();
  await expect(gallery(page, "add").locator("img")).toHaveCount(1);
  await expectDraft(page, "add");
});

for (const name of ["photo", "video"] as const) {
  test(`retirer une ${name === "photo" ? "photo" : "vidéo"} publiée rafraîchit la fiche en revue et conserve ses octets`, async ({ page }) => {
    await prepare(page, name);
    const photos = gallery(page, name);
    await photos.locator("summary").click();
    await photos.getByRole("button", { name: "Retirer", exact: true }).click();
    await expect(photos.locator(name === "photo" ? "img" : "video")).toHaveCount(0);
    await expectDraft(page, name);
    const state = await (await page.request.get(`${STUB}/__media-review/${name}`)).json();
    expect(state.media).toEqual([]);
    expect(state.storageRemovals).toBe(0);
  });
}

test("remplacer une couverture publiée par la vraie route garde deux objets distincts et la fiche en revue", async ({ page, baseURL }) => {
  await prepare(page, "cover");
  const urls: string[] = [];
  for (let i = 0; i < 2; i++) {
    const response = await page.request.post("/api/products/cover", {
      headers: { origin: baseURL! },
      multipart: { productId: idFor("cover"), file: { name: "cover.png", mimeType: "image/png", buffer: png } },
    });
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("draft");
    urls.push(body.coverUrl);
  }
  expect(new Set(urls).size).toBe(2);
  const state = await (await page.request.get(`${STUB}/__media-review/cover`)).json();
  expect(state.uploads).toHaveLength(2);
  expect(state.uploads.every((entry: { upsert: string }) => entry.upsert === "false")).toBe(true);
  expect(state.storageRemovals).toBe(0);
  await page.reload();
  await expectDraft(page, "cover");
});

test("la demande vidéo laisse la fiche publiée ; seule sa confirmation la renvoie en revue", async ({ page, baseURL }) => {
  const card = await prepare(page, "confirm");
  const demand = await page.request.post("/api/products/media/video", {
    headers: { origin: baseURL! }, data: { productId: idFor("confirm"), step: "demande", ext: "mp4" },
  });
  expect(demand.status()).toBe(200);
  const link = await demand.json();
  expect(link.token).toBe("media-fixture");
  await page.reload();
  await expect(card.getByRole("link", { name: "Revue média confirm", exact: true })).toBeVisible();
  const confirmation = await page.request.post("/api/products/media/video", {
    headers: { origin: baseURL! }, data: { productId: idFor("confirm"), step: "confirme", path: link.path },
  });
  expect(confirmation.status()).toBe(200);
  expect((await confirmation.json()).status).toBe("draft");
  await page.reload();
  await expectDraft(page, "confirm");
  await gallery(page, "confirm").locator("summary").click();
  await expect(gallery(page, "confirm").locator("video")).toHaveCount(1);
});

test("une fiche archivée garde ses médias lisibles et tous les contrôles de modification désactivés", async ({ page, baseURL }) => {
  const card = await prepare(page, "archived");
  await expect(card.getByText("Archivé", { exact: true })).toBeVisible();
  const photos = gallery(page, "archived");
  await photos.locator("summary").click();
  await expect(photos.locator("img")).toHaveCount(1);
  await expect(photos.getByRole("button", { name: "Retirer", exact: true })).toBeDisabled();
  for (const input of await photos.locator('input[type="file"]').all()) await expect(input).toBeDisabled();
  await expect(card.locator("label", { hasText: "Remplacer la photo principale" })).toHaveCount(0);
  const before = await (await page.request.get(`${STUB}/__media-review/archived`)).json();
  const image = await page.request.post("/api/products/media", {
    headers: { origin: baseURL! }, multipart: { productId: idFor("archived"), file: { name: "photo.png", mimeType: "image/png", buffer: png } },
  });
  const remove = await page.request.delete("/api/products/media", {
    headers: { origin: baseURL! }, data: { productId: idFor("archived"), mediaId: before.media[0].id },
  });
  const video = await page.request.post("/api/products/media/video", {
    headers: { origin: baseURL! }, data: { productId: idFor("archived"), step: "demande", ext: "mp4" },
  });
  const cover = await page.request.post("/api/products/cover", {
    headers: { origin: baseURL! }, multipart: { productId: idFor("archived"), file: { name: "cover.png", mimeType: "image/png", buffer: png } },
  });
  expect([image.status(), remove.status(), video.status(), cover.status()]).toEqual([409, 409, 409, 409]);
  const after = await (await page.request.get(`${STUB}/__media-review/archived`)).json();
  expect(after.product.status).toBe("archived");
  expect(after.media).toEqual(before.media);
  expect(after.writes).toBe(0);
  expect(after.uploads).toEqual([]);
  expect(after.signed).toEqual([]);
});
