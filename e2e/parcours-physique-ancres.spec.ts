import { test, expect, type Page } from "@playwright/test";

/**
 * LES ANCRES ARRIVENT SOUS L'EN-TÊTE REPLIÉ, PAS DESSOUS — 360 × 800, mesuré
 * le 2026-10-19 (voir `tests/ancres-en-tete.test.ts`).
 *
 * Avant : un lien du tableau de bord vers `/vendre#mes-produits` posait la
 * section à 2 px du haut (le pli de l'en-tête remontait la page de 94 px), et
 * un chargement complet de la même adresse restait en haut de page.
 *
 * Projet `physique` : /vendre et le tableau de bord exigent une session
 * vendeur, que seul le stub Supabase sait servir.
 */

test.use({ viewport: { width: 360, height: 800 } });

async function connecte(page: Page) {
  const session = {
    access_token: "jeton-vendeur-preparation-ancres",
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

/** Position de la cible une fois le défilement (glissé) et le pli terminés. */
async function arrivee(page: Page, id: string) {
  // La CIBLE d'abord. En navigation cliente, l'adresse change avant que le
  // segment de destination ait fini de se rendre : sous charge, la boucle de
  // stabilité ci-dessous pouvait conclure (5 lectures identiques) alors que la
  // section n'existait pas encore, et `getElementById(id)!` levait. Mesuré le
  // 2026-10-27 : 1 échec sur 379 avec 4 workers, 3 verts sur 3 en isolé.
  await page.locator(`[id="${id}"]`).waitFor({ state: "attached" });
  let precedente = "";
  let identiques = 0;
  for (let i = 0; i < 100 && identiques < 5; i++) {
    const lecture = await page.evaluate(() => `${Math.round(scrollY)}|${document.querySelector("header")?.offsetHeight}`);
    identiques = lecture === precedente ? identiques + 1 : 0;
    precedente = lecture;
    await page.waitForTimeout(100);
  }
  return page.evaluate((id) => ({
    cible: Math.round(document.getElementById(id)!.getBoundingClientRect().top),
    entete: Math.round(document.querySelector("header")!.getBoundingClientRect().bottom),
    replie: document.querySelector("header")!.hasAttribute("data-compact"),
  }), id);
}

function sousLEntete({ cible, entete, replie }: { cible: number; entete: number; replie: boolean }) {
  expect(replie, "l'en-tête doit être replié après le saut").toBe(true);
  expect(cible, "la section ne doit pas finir sous l'en-tête").toBeGreaterThanOrEqual(entete);
  expect(cible, "la section doit être juste sous l'en-tête").toBeLessThanOrEqual(entete + 40);
}

test("lien d'une autre page vers /vendre#mes-produits : la section arrive sous l'en-tête replié", async ({ page }) => {
  await connecte(page);
  await page.goto("/tableau-de-bord", { waitUntil: "networkidle" });
  await page.locator('a[href="/vendre#mes-produits"]:visible').first().click();
  await page.waitForURL(/\/vendre#mes-produits$/);
  sousLEntete(await arrivee(page, "mes-produits"));
});

test("chargement complet de /vendre#mes-produits : la page descend jusqu'à la section", async ({ page }) => {
  await connecte(page);
  await page.goto("/vendre#mes-produits");
  sousLEntete(await arrivee(page, "mes-produits"));
});

test("mouvement réduit : saut direct, toujours sous l'en-tête replié", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await connecte(page);
  await page.goto("/vendre#mes-produits");
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior)).toBe("auto");
  sousLEntete(await arrivee(page, "mes-produits"));
});
