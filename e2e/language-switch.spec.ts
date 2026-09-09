import { test, expect } from "@playwright/test";

for (const mobile of [false, true]) {
  test.describe(mobile ? "language menu on mobile" : "language menu on desktop", () => {
    test.use({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 }, isMobile: mobile, hasTouch: mobile });

    test("selection closes the menu, translates the page and persists all four languages", async ({ page, context }) => {
      await page.goto("/recharges", { waitUntil: "networkidle" });
      const menu = page.locator("header:visible details").filter({ has: page.getByRole('button', { name: 'Français FR', exact: true, includeHidden: true }) });
      const summary = menu.locator("summary");
      for (const [lang, name, title] of [
        ["fr", "Français FR", "Recharges et paiements"],
        ["en", "English EN", "Top-ups and payments"],
        ["es", "Español ES", "Recargas y pagos"],
        ["ht", "Kreyòl ayisyen KR", "Rechaj ak peman"],
        ["fr", "Français FR", "Recharges et paiements"],
      ]) {
        await summary.click();
        await menu.getByRole("button", { name, exact: true }).click();
        await expect(menu).not.toHaveAttribute("open", "");
        await expect(summary).toBeFocused();
        await expect(page.locator("h1")).toHaveText(title);
        await expect(page.locator("html")).toHaveAttribute("lang", lang);
        await expect(summary).toHaveAttribute("aria-busy", "false");
        await expect(page).toHaveURL(/\/recharges$/);
      }
      expect((await context.cookies()).find((cookie) => cookie.name === "zabelie_lang")?.value).toBe("fr");
      await page.reload();
      await expect(page.locator("h1")).toHaveText("Recharges et paiements");
      await expect(menu).not.toHaveAttribute("open", "");
    });

    test("the menu dismisses outside and with Escape without changing the language", async ({ page }) => {
      await page.goto("/recharges", { waitUntil: "networkidle" });
      const menu = page.locator("header:visible details").filter({ has: page.getByRole('button', { name: 'Français FR', exact: true, includeHidden: true }) });
      const summary = menu.locator("summary");
      await summary.click();
      if (mobile) await page.locator("h1").tap({ position: { x: 2, y: 2 } });
      else await page.locator("h1").click({ position: { x: 2, y: 2 } });
      await expect(menu).not.toHaveAttribute("open", "");
      await summary.click();
      await menu.getByRole("button", { name: "English EN", exact: true }).focus();
      await page.keyboard.press("Escape");
      await expect(menu).not.toHaveAttribute("open", "");
      await expect(summary).toBeFocused();
      await expect(page.locator("html")).toHaveAttribute("lang", "fr");
    });

    test("selection closes immediately while the translated response is still pending", async ({ page }) => {
      await page.goto("/recharges", { waitUntil: "networkidle" });
      let release!: () => void;
      const responseGate = new Promise<void>((resolve) => { release = resolve; });
      await page.route("**/recharges?**", async (route) => {
        if (route.request().headers().rsc === "1") await responseGate;
        await route.continue();
      });
      const menu = page.locator("header:visible details").filter({ has: page.getByRole('button', { name: 'Français FR', exact: true, includeHidden: true }) });
      const summary = menu.locator("summary");
      await summary.click();
      try {
        await menu.getByRole("button", { name: "English EN", exact: true }).click();
        await expect(menu).not.toHaveAttribute("open", "");
        await expect(summary).toHaveAttribute("aria-busy", "true");
        await expect(summary).toBeFocused();
      } finally { release(); }
      await expect(page.locator("h1")).toHaveText("Top-ups and payments");
      await expect(summary).toHaveAttribute("aria-busy", "false");
      await expect(menu).not.toHaveAttribute("open", "");
    });
  });
}
