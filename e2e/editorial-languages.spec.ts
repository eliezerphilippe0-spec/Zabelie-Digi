import { test, expect } from "@playwright/test";
import { t, type Lang } from "../lib/i18n";
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
