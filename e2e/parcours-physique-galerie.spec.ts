import { test, expect, type Page } from "@playwright/test";

/**
 * LES PHOTOS DE /vendre PARTENT COMPRESSÉES — revue du 2026-10-08 (UX-01, UX-02, RES-01).
 *
 * La photo d'un téléphone pèse 2 à 5 Mo ; le stockage refuse au-delà de
 * 1,5 Mo. Les tests unitaires disent que le CODE branche le compresseur ; ce
 * parcours dit qu'un vrai navigateur, sur le vrai écran `/vendre`, envoie une
 * photo réduite. La route est interceptée : rien n'est écrit nulle part.
 */

async function connecte(page: Page, token: string) {
  const session = {
    access_token: token,
    refresh_token: "rafraichissement-de-test",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: 4102444800,
    user: {
      id: "11111111-1111-1111-1111-111111111111",
      aud: "authenticated",
      role: "authenticated",
      email: "vande@example.ht",
      app_metadata: {},
      user_metadata: {},
      created_at: "2026-01-01T00:00:00Z",
    },
  };
  const value = "base64-" + Buffer.from(JSON.stringify(session), "utf8").toString("base64url");
  await page.context().addCookies([{ name: "sb-127-auth-token", value, domain: "127.0.0.1", path: "/" }]);
}

const PLAFOND = 1_500 * 1024;

/** Une « photo de téléphone » : 4000 × 3000, dégradés et grain — lourde, comme
 * une vraie, et pas du bruit pur qu'aucun encodeur ne sait réduire. */
async function photoDeTelephone(page: Page): Promise<Buffer> {
  const jpeg = Buffer.from(
    await page.evaluate(async () => {
      const c = document.createElement("canvas");
      c.width = 4000;
      c.height = 3000;
      const ctx = c.getContext("2d")!;
      const g = ctx.createLinearGradient(0, 0, 4000, 3000);
      g.addColorStop(0, "#0b6e4f");
      g.addColorStop(0.5, "#f4d35e");
      g.addColorStop(1, "#ee964b");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 4000, 3000);
      const img = ctx.getImageData(0, 0, 4000, 3000);
      let graine = 7;
      for (let i = 0; i < img.data.length; i += 4) {
        graine = (graine * 1103515245 + 12345) & 0x7fffffff;
        const grain = (graine % 48) - 24;
        img.data[i] += grain;
        img.data[i + 1] += grain;
        img.data[i + 2] += grain;
      }
      ctx.putImageData(img, 0, 0);
      const blob: Blob = await new Promise((ok) => c.toBlob((b) => ok(b!), "image/jpeg", 0.95));
      // En base64 : un tableau de nombres de plusieurs Mo traverserait mal le pont.
      const url: string = await new Promise((ok) => {
        const r = new FileReader();
        r.onload = () => ok(r.result as string);
        r.readAsDataURL(blob);
      });
      return url.slice(url.indexOf(",") + 1);
    }),
    "base64"
  );
  expect(jpeg.length, "la photo source doit dépasser le plafond, sinon le test ne prouve rien").toBeGreaterThan(PLAFOND);
  return jpeg;
}

test("une photo de téléphone part compressée en WebP, sous le plafond du stockage", async ({ page }) => {
  await connecte(page, "vendeur-preparation-studio");
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto("/vendre", { waitUntil: "networkidle" });

  const galerie = page
    .locator("#produit-77777777-7777-7777-7777-777777777777 details")
    .filter({ has: page.locator("summary", { hasText: /^Photos \(\d\/\d\)$/ }) });
  const resume = galerie.locator("summary");
  // RES-01 : l'ouverture se faisait sur une bande de 16 px.
  expect((await resume.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await resume.click();
  const envoi = galerie.locator("label", { hasText: "Ajouter une photo" });
  expect((await envoi.boundingBox())!.height).toBeGreaterThanOrEqual(44);

  const jpeg = await photoDeTelephone(page);

  let corps: Buffer | null = null;
  await page.route("**/api/products/media", async (route) => {
    corps = route.request().postDataBuffer();
    await route.fulfill({ json: { ok: true, id: "media-e2e", url: "https://cdn.test/media-e2e.webp" } });
  });
  await galerie.locator('input[type="file"][accept^="image/"]').setInputFiles({
    name: "IMG_20261008.jpg",
    mimeType: "image/jpeg",
    buffer: jpeg,
  });
  await expect(galerie.locator("img")).toHaveCount(1);

  expect(corps, "aucun envoi intercepté").not.toBeNull();
  const envoye = corps! as Buffer;
  const entete = envoye.toString("latin1");
  expect(entete).toMatch(/filename="IMG_20261008\.webp"\r\nContent-Type: image\/webp/);
  expect(envoye.length).toBeLessThan(PLAFOND);
  expect(envoye.length).toBeLessThan(jpeg.length / 4);
  test.info().annotations.push({ type: "poids", description: `${jpeg.length} → ${envoye.length} octets` });
  await expect(galerie.locator("summary")).toHaveText("Photos (1/6)");
});

test("UX-02 : un fichier et un service reçoivent leur photo principale, compressée", async ({ page }) => {
  /* Le catalogue n'affiche que la photo principale (`cover_url`). Avant ce
   * correctif, seule la fiche physique pouvait en recevoir une : un fichier
   * ou un service apparaissait sans image, même avec six photos de galerie. */
  await connecte(page, "vendeur-preparation-studio");
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto("/vendre", { waitUntil: "networkidle" });

  // Les deux brouillons de la doublure : un fichier SANS photo principale, et
  // un service qui en a déjà une — les deux états du champ.
  for (const [id, libelle, repere] of [
    ["77777777-7777-7777-7777-777777777777", "Ajouter la photo principale", "Photo principale · à compléter"],
    ["66666666-6666-6666-6666-666666666666", "Remplacer la photo principale", "Photo principale · renseigné"],
  ]) {
    const champ = page.locator(`#produit-${id} label`, { hasText: libelle });
    await expect(champ).toBeVisible();
    expect((await champ.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    // La liste de préparation dit la vérité : elle mesure la photo du catalogue.
    await expect(page.locator(`#produit-${id}`).getByText(repere, { exact: true })).toBeVisible();
  }

  const fiche = page.locator("#produit-77777777-7777-7777-7777-777777777777");

  // Joignable au CLAVIER : le champ est masqué visuellement, pas retiré.
  const entree = fiche.locator("label", { hasText: "Ajouter la photo principale" }).locator('input[type="file"]');
  await entree.focus();
  await expect(entree).toBeFocused();

  const jpeg = await photoDeTelephone(page);
  let corps: Buffer | null = null;
  await page.route("**/api/products/cover", async (route) => {
    corps = route.request().postDataBuffer();
    await route.fulfill({ json: { ok: true, coverUrl: "https://cdn.test/couverture-e2e.webp?v=1" } });
  });
  await fiche
    .locator("label", { hasText: "Ajouter la photo principale" })
    .locator('input[type="file"]')
    .setInputFiles({ name: "IMG_20261009.jpg", mimeType: "image/jpeg", buffer: jpeg });

  await expect(fiche.getByRole("status").filter({ hasText: "Photo principale enregistrée." })).toBeVisible();
  await expect(fiche.locator('img[src^="https://cdn.test/couverture-e2e.webp"]')).toHaveCount(1);
  await expect(fiche.locator("label", { hasText: "Remplacer la photo principale" })).toBeVisible();

  expect(corps, "aucun envoi intercepté").not.toBeNull();
  const envoye = corps! as Buffer;
  expect(envoye.toString("latin1")).toMatch(/name="productId"\r\n\r\n77777777-7777-7777-7777-777777777777\r\n/);
  expect(envoye.toString("latin1")).toMatch(/filename="IMG_20261009\.webp"\r\nContent-Type: image\/webp/);
  expect(envoye.length).toBeLessThan(PLAFOND);
  test.info().annotations.push({ type: "poids", description: `${jpeg.length} → ${envoye.length} octets` });
});
