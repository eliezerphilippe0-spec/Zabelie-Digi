import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { t, type Lang } from "../lib/i18n";
import { formatHTG } from "../lib/sample-data";

/**
 * « MES CLIENTS » (docs/75 §5.C, PR-Z3). Vraie page, seuls Auth/PostgREST sont
 * simulés. Le stub rend TOUTES les ventes du scénario sans filtrer : une
 * commande en attente, une échouée, un paiement d'essai, une vente gratuite et
 * la vente d'un AUTRE vendeur. Si l'une d'elles apparaît, c'est la page qui a
 * laissé passer, pas le stub.
 */

const STUB = "http://127.0.0.1:15421";
type ClientsState = { clients: { buyers: string[]; queries: { sellerId: string; params: Record<string, string>; serviceRole: boolean }[];
  deliveryReads: { select: string; tokenActorId: string | null; serviceRole: boolean }[] } };

async function vendeur(request: APIRequestContext, page: Page, lang: Lang, clients: true | "vide") {
  const scenario = randomUUID(), actorA = randomUUID(), actorB = randomUUID();
  const init = await request.post(`${STUB}/__profile-identity`, { data: { scenario, actorA, actorB, clients } });
  expect(init.status()).toBe(200);
  const session = { access_token: `profile-identity-${actorA}`, refresh_token: "fixture", token_type: "bearer", expires_at: 4102444800, expires_in: 3600,
    user: { id: actorA, aud: "authenticated", role: "authenticated" } };
  await page.context().addCookies([
    { name: "sb-127-auth-token", value: "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url"), domain: "127.0.0.1", path: "/" },
    { name: "zabelie_lang", value: lang, domain: "127.0.0.1", path: "/" },
  ]);
  return { actorA, etat: async (): Promise<ClientsState> => (await request.get(`${STUB}/__profile-identity?scenario=${scenario}`)).json() };
}

for (const { lang, largeur } of [{ lang: "ht" as Lang, largeur: 390 }, { lang: "fr" as Lang, largeur: 1280 }]) {
  test(`Mes clients : chiffres justes, pièges écartés, aucun numéro — ${lang}, ${largeur} px`, async ({ page, request }) => {
    const erreurs: string[] = [];
    page.on("console", (m) => { if (m.type() === "error") erreurs.push(m.text()); });
    await page.setViewportSize({ width: largeur, height: 900 });
    const { actorA, etat } = await vendeur(request, page, lang, true);

    await page.goto("/tableau-de-bord/clients");
    await expect(page.getByRole("heading", { level: 1, name: t(lang, "vendeur.clients.titre"), exact: true })).toBeVisible();
    await expect(page.getByRole("navigation", { name: t(lang, "vendeur.menu") }).getByRole("link", { name: t(lang, "vendeur.nav.clients"), exact: true }))
      .toHaveAttribute("aria-current", "page");

    const chiffres = page.locator("#chiffres-clients");
    const valeur = (cle: Parameters<typeof t>[1]) => chiffres.locator("div").filter({ hasText: t(lang, cle) }).locator("dd").first();
    await expect(valeur("vendeur.clients.k30")).toHaveText("1");
    await expect(valeur("vendeur.clients.k90")).toHaveText("2");
    await expect(valeur("vendeur.clients.revenus")).toHaveText("1");

    const top = page.locator("section[aria-labelledby=top-produits] li");
    await expect(top).toHaveCount(2);
    await expect(top.nth(0)).toContainText("Sak an pay fictif");
    await expect(top.nth(0)).toContainText(formatHTG(4500));
    await expect(top.nth(1)).toContainText("Liv kreyòl fictif");

    const liste = page.locator("section[aria-labelledby=liste-clients] li");
    await expect(liste).toHaveCount(3);
    await expect(liste.nth(0)).toContainText("Wilson");
    await expect(liste.nth(1)).toContainText(t(lang, "vendeur.clients.anonyme"));

    const texte = await page.locator("main").innerText();
    for (const fuite of ["Produit d'un autre vendeur fictif", formatHTG(9999), "Pierre-Fictif", "+509", "3700 0009", "Adresse privée"])
      expect(texte, `la page laisse passer « ${fuite} »`).not.toContain(fuite);
    await expect(page.locator("main a[download], main a[href^='tel:'], main a[href*='wa.me']")).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`mes-clients-${lang}-${largeur}.png`), fullPage: true });

    const { clients } = await etat();
    expect(clients.queries).toHaveLength(1);
    expect(clients.queries[0]).toMatchObject({ sellerId: actorA, serviceRole: true,
      params: { status: "in.(paid,delivered)", zabelie_payment_is_live: "eq.true", amount_htg: "gt.0" } });
    expect(clients.deliveryReads).toEqual([{ select: "user_id,full_name", tokenActorId: actorA, serviceRole: false }]);
    expect(erreurs).toEqual([]);
  });
}

test("Mes clients : sans vente, un état vide qui renvoie vers le partage et le QR", async ({ page, request }) => {
  await vendeur(request, page, "ht", "vide");
  await page.goto("/tableau-de-bord/clients");
  await expect(page.getByText(t("ht", "vendeur.clients.vide"), { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: t("ht", "vendeur.action.partager"), exact: true })).toHaveAttribute("href", "/tableau-de-bord/boutique#qr");
  await expect(page.locator("#chiffres-clients")).toHaveCount(0);
});

test("Mes clients : un visiteur non connecté est renvoyé vers la connexion", async ({ page }) => {
  await page.goto("/tableau-de-bord/clients");
  await expect(page).toHaveURL(/\/connexion\?next=%2Ftableau-de-bord%2Fclients$/);
});
