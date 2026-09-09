import { test, expect } from "@playwright/test";

for (const width of [320, 390, 1440]) {
  test(`appearance at ${width}px: visible, remembered and responsive to the system`, async ({ page, context }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: "dark" });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/", { waitUntil: "networkidle" });
    const root = page.locator("html");
    const trigger = page.locator('header summary[aria-label="Apparence"]');
    const menu = page.getByRole("group", { name: "Apparence", exact: true });
    await expect(trigger).toBeVisible();
    await expect(root).toHaveAttribute("data-theme", "light");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const search = page.locator('header input[name="q"]');
    expect((await search.boundingBox())!.width).toBeGreaterThan(80);
    const box = await trigger.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);

    for (const [label, value, rendered] of [["Sombre", "dark", "dark"], ["Clair", "light", "light"], ["Automatique", "system", "dark"]]) {
      await search.fill("formation");
      await trigger.click();
      const panel = await menu.boundingBox();
      expect(panel!.x).toBeGreaterThanOrEqual(0);
      expect(panel!.x + panel!.width).toBeLessThanOrEqual(width);
      await menu.getByRole("button", { name: label, exact: true }).click();
      await expect(search).toHaveValue("formation");
      await expect(trigger).toBeFocused();
      await expect(menu).toBeHidden();
      await expect(root).toHaveAttribute("data-theme", rendered);
      expect((await context.cookies()).find((c) => c.name === "zab_theme")?.value).toBe(value);
      await page.reload({ waitUntil: "networkidle" });
      await expect(root).toHaveAttribute("data-theme", rendered);
      await trigger.click();
      await expect(menu.getByRole("button", { name: label, exact: true })).toHaveAttribute("aria-pressed", "true");
      await page.keyboard.press("Escape");
    }
    await page.emulateMedia({ colorScheme: "light" });
    await expect(root).toHaveAttribute("data-theme", "light");
    await page.locator("header").getByRole("link", { name: "Digital", exact: true }).click();
    await expect(page).toHaveURL(/univers=numerique/);
    await page.emulateMedia({ colorScheme: "dark" });
    await expect(root).toHaveAttribute("data-theme", "dark");
    await trigger.click();
    await menu.getByRole("button", { name: "Clair", exact: true }).click();
    await page.emulateMedia({ colorScheme: "light" });
    await page.emulateMedia({ colorScheme: "dark" });
    await expect(root).toHaveAttribute("data-theme", "light");
    expect(errors).toEqual([]);
  });
}

test("appearance menu supports keyboard, outside dismissal and all four languages", async ({ page, context }) => {
  for (const [lang, label, automatic] of [["fr", "Apparence", "Automatique"], ["ht", "Aparans", "Otomatik"], ["en", "Appearance", "Automatic"], ["es", "Apariencia", "Automático"]]) {
    await context.addCookies([{ name: "zabelie_lang", value: lang, url: "http://localhost:3000" }]);
    await page.goto("/recharges", { waitUntil: "networkidle" });
    const trigger = page.locator(`header summary[aria-label="${label}"]`);
    const menu = page.getByRole("group", { name: label, exact: true });
    await trigger.focus();
    await page.keyboard.press("Enter");
    await expect(menu).toBeVisible();
    await page.keyboard.press("Tab");
    await expect(menu.getByRole("button").first()).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(trigger).toBeFocused();
    await trigger.click();
    await expect(menu.getByRole("button", { name: automatic, exact: true })).toBeVisible();
    await page.locator("h1").click({ position: { x: 2, y: 2 } });
    await expect(menu).toBeHidden();
  }
});

test("automatic resolves before hydration, including a changed device preference", async ({ page, context }) => {
  await context.addCookies([{ name: "zab_theme", value: "system", url: "http://localhost:3000" }]);
  await page.route("**/_next/static/**/*.js", (route) => route.abort());
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.emulateMedia({ colorScheme: "light" });
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});
