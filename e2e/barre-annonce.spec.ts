import { test, expect } from "@playwright/test";

/** Barre d'annonce défilante (components/barre-annonce.tsx). Mode démo. */

for (const width of [360, 1280]) {
  test(`la barre défile, sans débordement, et se met en pause à ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/catalogue");
    const barre = page.getByRole("marquee", { name: "Annonces" });
    await expect(barre).toBeVisible();
    await expect(barre.getByText("Le vendeur n'est payé qu'après la remise").first()).toBeVisible();
    const piste = barre.locator(".annonce-piste");
    expect(await piste.evaluate((el) => getComputedStyle(el).animationName)).toBe("annonce-defile");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

    const bouton = page.getByRole("button", { name: "Mettre les annonces en pause" });
    await bouton.click();
    expect(await piste.evaluate((el) => getComputedStyle(el).animationPlayState)).toBe("paused");
    await page.getByRole("button", { name: "Relancer les annonces" }).click();
    await page.mouse.move(0, 700);
    expect(await piste.evaluate((el) => getComputedStyle(el).animationPlayState)).toBe("running");
  });
}

test("mouvement réduit : la barre est immobile, une seule copie, sans bouton", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/catalogue");
  const barre = page.getByRole("marquee", { name: "Annonces" });
  expect(await barre.locator(".annonce-piste").evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
  await expect(barre.getByRole("button")).toHaveCount(0);
  await expect(barre.locator('.annonce-groupe[aria-hidden="true"]')).toBeHidden();
});

test("le premier arrêt du clavier reste le lien d'évitement", async ({ page }) => {
  await page.goto("/catalogue");
  await page.keyboard.press("Tab");
  expect(await page.evaluate(() => document.activeElement?.getAttribute("href"))).toBe("#main");
});

test("la barre se replie avec l'en-tête au défilement", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 700 });
  await page.goto("/catalogue");
  await page.mouse.wheel(0, 800);
  await expect(page.locator("header")).toHaveAttribute("data-compact", "");
  await expect(page.getByRole("marquee", { name: "Annonces" })).toBeHidden();
});
