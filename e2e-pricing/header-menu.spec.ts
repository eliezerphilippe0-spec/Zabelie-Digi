import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

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
    const trigger = page.locator('header summary[aria-label="Mon compte"]');
    const menu = trigger.locator("..");
    const panel = menu.locator(":scope > div");
    await trigger.click();
    await expect(menu.getByRole("link", { name: "Tableau de bord", exact: true })).toBeVisible();
    if (process.env.UI_QA_DIR) {
      await mkdir(process.env.UI_QA_DIR, { recursive: true });
      await page.screenshot({ path: join(process.env.UI_QA_DIR, "account-" + width + ".png") });
    }
    const bounds = await panel.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(8);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width - 8);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(height - 8);
    const anchor = await trigger.boundingBox();
    expect(Math.abs(bounds!.y - (anchor!.y + anchor!.height))).toBeLessThanOrEqual(8);
    await menu.getByRole("button", { name: "Déconnexion", exact: true }).scrollIntoViewIfNeeded();
    const logout = await menu.getByRole("button", { name: "Déconnexion", exact: true }).boundingBox();
    expect(logout!.y + logout!.height).toBeLessThanOrEqual(height - 8);
    await page.keyboard.press("Escape");
    await expect(menu).not.toHaveAttribute("open", "");
    await expect(trigger).toBeFocused();
    await trigger.click();
    await page.locator("h1").click();
    await expect(menu).not.toHaveAttribute("open", "");
    await trigger.click();
    // Keyboard users can move to another header control without overlapping panels.
    await page.locator('header summary[aria-label="Français"]').focus();
    await page.keyboard.press("Enter");
    await expect(menu).not.toHaveAttribute("open", "");
    expect(await page.locator("header details[open]").count()).toBe(1);
    const languageBox = await page.locator("header details[open] > div").boundingBox();
    expect(languageBox!.x).toBeGreaterThanOrEqual(8);
    await page.keyboard.press("Escape");
    await trigger.click();
    await page.evaluate(() => window.scrollTo(0, 400));
    await expect(menu).not.toHaveAttribute("open", "");
    await trigger.click();
    await menu.getByRole("link", { name: "Aide", exact: true }).click();
    await expect(page).toHaveURL(/\/aide$/);
    await expect(page.locator("header details[open]")).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}
