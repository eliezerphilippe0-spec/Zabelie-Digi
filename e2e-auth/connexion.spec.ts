import { test, expect, type Page } from "@playwright/test";
import { t } from "../lib/i18n";
const auth = "http://127.0.0.1:54323/auth/v1/";
async function fill(page: Page, email: string, password="Valid-test-123!") {
  await page.locator("#auth-email").fill(email);
  await page.locator("#auth-password").fill(password);
}

test("le client compilé appelle Auth et affiche une erreur exploitable", async ({ page }) => {
  await page.goto("/connexion");
  await fill(page,"buyer@example.test","wrong-password");
  const request=page.waitForRequest((r)=>r.url().startsWith(auth+"token") && r.method()==="POST");
  await page.locator('button[type="submit"]').click();
  expect((await request).postDataJSON().email).toBe("buyer@example.test");
  await expect(page.getByText(t("fr","auth.err.credentials"),{exact:true})).toBeVisible();
  await expect(page.locator('button[type="submit"]')).toBeEnabled();
});

test("connexion réussie : session transmise au serveur et conservée après rechargement", async ({ page, context }) => {
  await page.goto("/connexion?next=%2Fmes-achats");
  await fill(page,"buyer@example.test");
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/mes-achats$/);
  expect((await context.cookies()).some((c)=>/^sb-127-auth-token(?:\.\d+)?$/.test(c.name))).toBe(true);
  await page.reload();
  await expect(page).toHaveURL(/\/mes-achats$/);
  await expect(page.locator('a[href^="/connexion?next="]')).toHaveCount(0);
});

test("inscription avec confirmation : métadonnées envoyées, aucune fausse session", async ({ page, context }) => {
  await page.goto("/connexion");
  await page.getByRole("button",{name:t("fr","auth.tab.signup"),exact:true}).click();
  await page.locator("#auth-name").fill("Créateur test");
  await fill(page,"new@example.test");
  const request=page.waitForRequest((r)=>r.url().startsWith(auth+"signup") && r.method()==="POST");
  await page.locator('button[type="submit"]').click();
  expect((await request).postDataJSON().data.display_name).toBe("Créateur test");
  await expect(page.locator('[role="status"]')).toBeVisible();
  expect((await context.cookies()).some((c)=>/^sb-127-auth-token(?:\.\d+)?$/.test(c.name))).toBe(false);
});

test("adresse déjà inscrite : bascule vers Connexion sans bouton bloqué", async ({ page }) => {
  await page.goto("/connexion");
  await page.getByRole("button",{name:t("fr","auth.tab.signup"),exact:true}).click();
  await page.locator("#auth-name").fill("Créateur test");
  await fill(page,"existing@example.test");
  await page.locator('button[type="submit"]').click();
  await expect(page.getByText(t("fr","auth.err.exists"),{exact:true})).toBeVisible();
  await expect(page.getByRole("heading",{level:1,name:t("fr","auth.tab.signin")})).toBeVisible();
});

for(const lang of ["ht","en","es"] as const) {
  test(`erreur de connexion traduite et lisible sur mobile : ${lang}`, async ({ page, context }) => {
    await page.setViewportSize({width:390,height:844});
    await context.addCookies([{name:"zabelie_lang",value:lang,url:"http://127.0.0.1:3003"}]);
    await page.goto("/connexion");
    await fill(page,"buyer@example.test","wrong-password");
    await page.locator('button[type="submit"]').click();
    await expect(page.getByText(t(lang,"auth.err.credentials"),{exact:true})).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  });
}
