import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

/*
 * Depuis le chantier design, Phase 4 (V-28 A19), le menu du compte a deux
 * places complémentaires : l'en-tête à partir de 768 px, la barre de
 * navigation inférieure en dessous, où son panneau s'ouvre VERS LE HAUT. Les
 * mêmes exigences valent aux deux endroits : panneau dans l'écran,
 * déconnexion atteignable, Échap, clic extérieur, un seul menu ouvert,
 * défilement sans décrochage, fermeture en suivant un lien.
 */
/** Les menus de l en-tête et de la barre, pas les accordéons de la page. */
const MENUS_OUVERTS = "header details[open], nav.barre-nav details[open]";

for (const [width, height] of [[1440, 600], [390, 600], [320, 568]]) {
  test("connected account menu stays reachable at " + width + "px", async ({ page }) => {
    await page.setViewportSize({ width, height });
    const value = "base64-" + Buffer.from(JSON.stringify({
      access_token: "pricing-buyer", refresh_token: "refresh-test", token_type: "bearer",
      expires_in: 3600, expires_at: 4102444800,
      user: { id: "22222222-2222-2222-2222-222222222222", aud: "authenticated", role: "authenticated", email: "pricing@example.ht", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" },
    })).toString("base64url");
    await page.context().addCookies([{ name: "sb-127-auth-token", value, domain: "127.0.0.1", path: "/" }]);
    const errors: string[] = [];
    page.on("pageerror", e => errors.push(e.message));
    await page.goto("/");
    await expect(page.locator("main h1")).toBeVisible();
    const mobile = width < 768;
    const enTete = page.locator('header summary[aria-label="Mon compte"]');
    const trigger = mobile ? page.locator("nav.barre-nav details > summary") : enTete;
    // Une seule des deux places est affichée à une largeur donnée.
    if (mobile) await expect(enTete).toBeHidden();
    else await expect(page.locator("nav.barre-nav")).toBeHidden();
    const menu = trigger.locator("..");
    const panel = menu.locator(":scope > div");
    /** Le panneau colle à son déclencheur : dessous dans l'en-tête, dessus dans la barre. */
    const colle = async () => {
      const p = await panel.boundingBox();
      const t = await trigger.boundingBox();
      const ecart = mobile ? t!.y - (p!.y + p!.height) : p!.y - (t!.y + t!.height);
      expect(Math.abs(ecart)).toBeLessThanOrEqual(8);
      return p!;
    };
    await trigger.click();
    await expect(menu.getByRole("link", { name: "Tableau de bord", exact: true })).toBeVisible();
    if (process.env.UI_QA_DIR) {
      await mkdir(process.env.UI_QA_DIR, { recursive: true });
      await page.screenshot({ path: join(process.env.UI_QA_DIR, "account-" + width + ".png") });
    }
    const bounds = await colle();
    expect(bounds.x).toBeGreaterThanOrEqual(8);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width - 8);
    expect(bounds.y).toBeGreaterThanOrEqual(8);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(height - 8);
    await menu.getByRole("button", { name: "Déconnexion", exact: true }).scrollIntoViewIfNeeded();
    const logout = await menu.getByRole("button", { name: "Déconnexion", exact: true }).boundingBox();
    expect(logout!.y + logout!.height).toBeLessThanOrEqual(height - 8);
    await page.keyboard.press("Escape");
    await expect(menu).not.toHaveAttribute("open", "");
    await expect(trigger).toBeFocused();
    await trigger.click();
    // The heading can be covered by the dropdown on mobile; use the free page margin.
    await page.mouse.click(4, Math.round(height / 2));
    await expect(menu).not.toHaveAttribute("open", "");
    await trigger.click();
    // Keyboard users can move to another header control without overlapping panels.
    await page.locator('header summary[aria-label="FR, Français"]').focus();
    await page.keyboard.press("Enter");
    await expect(menu).not.toHaveAttribute("open", "");
    expect(await page.locator(MENUS_OUVERTS).count()).toBe(1);
    const languageBox = await page.locator("header details[open] > div").boundingBox();
    expect(languageBox!.x).toBeGreaterThanOrEqual(8);
    await page.keyboard.press("Escape");
    await trigger.click();
    // Scrolling or following an anchor must not detach or unexpectedly dismiss the menu.
    await page.evaluate(() => new Promise<void>(resolve => {
      document.addEventListener("scrollend", () => resolve(), { once: true });
      window.scrollTo({ top: 400, behavior: "smooth" });
    }));
    await expect(menu).toHaveAttribute("open", "");
    const scrolledPanel = await colle();
    expect(scrolledPanel.y + scrolledPanel.height).toBeLessThanOrEqual(height - 8);
    await menu.getByRole("link", { name: "Aide", exact: true }).click();
    await expect(page).toHaveURL(/\/aide$/);
    await expect(page.locator(MENUS_OUVERTS)).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}
