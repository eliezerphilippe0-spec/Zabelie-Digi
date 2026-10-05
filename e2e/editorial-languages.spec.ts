import { test, expect } from "@playwright/test";
import { t, type Lang } from "../lib/i18n";
import { CONDITIONS } from "../lib/policy-terms";
import { POLITIQUE } from "../lib/policy-privacy";

for (const lang of ["fr", "ht", "en", "es"] as const) {
  test(`documents légaux lisibles à 360 px : ${lang}`, async ({ page, context }) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.setViewportSize({ width: 360, height: 800 });
    // Legal documents use the existing language cookie at their stable URL.
    await context.addCookies([{ name: "zabelie_lang", value: lang, url: "http://localhost:3000" }]);
    for (const [path, doc] of [["conditions", CONDITIONS[lang]], ["confidentialite", POLITIQUE[lang]]] as const) {
      const response = await page.goto(`/${path}`);
      expect(response?.status()).toBe(200);
      await expect(page.locator("html")).toHaveAttribute("lang", lang);
      await expect(page.getByRole("heading", { level: 1, name: doc.titre })).toBeVisible();
      const headings = doc.sections.map(section => section.titre);
      if (path === "confidentialite") headings.unshift(t(lang, "collections.privacy.title"));
      await expect(page.locator("main h2")).toHaveText(headings);
      if (path === "confidentialite") {
        const refuse = page.getByRole("button", { name: t(lang, "pixels.consent.refuse"), exact: true });
        await refuse.click();
        await expect(refuse).toHaveAttribute("aria-pressed", "true");
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await expect(page.locator("main")).not.toContainText("Application error");
      if (lang === "fr") await page.screenshot({ path: test.info().outputPath(`${path}-360.png`), fullPage: false });
    }
    expect(errors).toEqual([]);
    // Use the existing footer link to reach the terms, not only direct URLs.
    await page.locator("footer summary").filter({ hasText: t(lang, "footer.legal") }).click();
    await page.locator('footer a[href="/conditions"]').click();
    await expect(page.getByRole("heading", { level: 1, name: CONDITIONS[lang].titre })).toBeVisible();
  });
}
for (const lang of ["fr", "ht", "en", "es"] as Lang[]) {
  test(`pages publiques indexables dans leur langue : ${lang}`, async ({ page, context }) => {
    await context.addCookies([{ name:"zabelie_lang", value:lang === "fr" ? "en" : "fr", url:"http://localhost:3000" }]);
    for (const [path, title] of [["aide","aide.title"],["a-propos","about.title"],["recharges","recharges.title"]] as const) {
      const response = await page.goto(`/${lang}/${path}`);
      expect(response?.status()).toBe(200);
      await expect(page.locator("html")).toHaveAttribute("lang",lang);
      await expect(page.getByRole("heading",{level:1,name:t(lang,title)})).toBeVisible();
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href",new RegExp(`/${lang}/${path}$`));
      await expect(page.locator('link[rel="alternate"][hreflang="ht"]')).toHaveAttribute("href",new RegExp(`/ht/${path}$`));
    }
  });
}
test("une langue inexistante rend 404",async ({request})=>{
  expect((await request.get("/zz/aide")).status()).toBe(404);
});

test("changer la langue d’une URL traduite conserve le focus et ferme le menu",async({page})=>{
  await page.goto("/en/recharges?source=test",{waitUntil:"networkidle"});
  const menu=page.locator("header:visible details").filter({has:page.getByRole("button", { name: "Français FR", exact: true, includeHidden: true })});
  await menu.locator("summary").click();
  await menu.getByRole("button",{name:"Español ES",exact:true}).click();
  await expect(page).toHaveURL(/\/es\/recharges\?source=test$/);
  await expect(page.getByRole("heading",{level:1,name:t("es","recharges.title")})).toBeVisible();
  await expect(menu).not.toHaveAttribute("open","");
  await expect(menu.locator("summary")).toBeFocused();
});
