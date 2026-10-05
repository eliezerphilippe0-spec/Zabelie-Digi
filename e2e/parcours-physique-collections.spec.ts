import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { checkoutOrderId } from "../lib/checkout-idempotency";
async function connecte(page: Page, token: string) {
  const session = {
    access_token: token,
    refresh_token: "rafraichissement-de-test",
    token_type: "bearer",
    expires_in: 3600,
    // Très loin dans le futur : sinon le client tente un rafraîchissement.
    expires_at: 4102444800,
    user: {
      id: "11111111-1111-1111-1111-111111111111",
      aud: "authenticated",
      role: "authenticated",
      email: "achte@example.ht",
      app_metadata: {},
      user_metadata: {},
      created_at: "2026-01-01T00:00:00Z",
    },
  };
  const value =
    "base64-" + Buffer.from(JSON.stringify(session), "utf8").toString("base64url");
  await page.context().addCookies([
    { name: "sb-127-auth-token", value, domain: "127.0.0.1", path: "/" },
  ]);
}



test("un favori est enregistré dans le compte et survit au rechargement", async ({ page }) => {
 await connecte(page, "collections-save");
 await page.goto("/produit/filtre-huile-corolla");
 await page.getByRole("button", { name: "Ajouter aux favoris" }).click();
 await expect(page.getByRole("button", { name: "Retirer des favoris" })).toBeVisible();
 await page.reload();
 await expect(page.getByRole("button", { name: "Retirer des favoris" })).toHaveAttribute("aria-pressed", "true");
 await page.goto("/favoris");
 await expect(page.getByText("Filtre à huile Corolla", { exact: true })).toBeVisible();
 await page.getByRole("button", { name: "Retirer des favoris" }).click();
 await expect(page.getByText("Cette liste est vide pour le moment.")).toBeVisible();
});
test("une erreur de stockage ne crée pas un faux favori", async ({ page }) => {
 await connecte(page, "collections-fail");
 await page.goto("/produit/filtre-huile-corolla");
 await page.getByRole("button", { name: "Ajouter aux favoris" }).click();
 await expect(page.getByRole("button", { name: "Ajouter aux favoris" })).toHaveAttribute("aria-pressed", "false");
 await expect(page.locator('p[role="alert"]')).toContainText("momentanément indisponible");
});
test("une boutique suivie se retrouve dans sa liste personnelle", async ({ page }) => {
 await connecte(page, "collections-shops");
 await page.goto("/createur/22222222-2222-2222-2222-222222222222");
 await page.getByRole("button", { name: "Suivre cette boutique" }).click();
 await expect(page.getByRole("button", { name: "Ne plus suivre" })).toBeVisible();
 await page.goto("/boutiques-suivies");
 await expect(page.getByRole("heading", { name: "Garaj Petyonvil" })).toBeVisible();
 await page.getByRole("button", { name: "Ne plus suivre" }).click();
 await expect(page.getByText("Cette liste est vide pour le moment.")).toBeVisible();
});
test("diaspora : consentement requis, récapitulatif, et conservation sur erreur", async ({ page }, testInfo) => {
 await connecte(page, "recipient-ui");
 await page.setViewportSize({ width: 390, height: 844 });
 await page.goto("/produit/filtre-huile-corolla");
 let posted: Record<string, unknown> | null = null;
 await page.route("**/api/checkout", route => { posted = route.request().postDataJSON(); return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Essai indisponible" }) }); });
 await page.getByRole("checkbox", { name: "Acheter pour un proche en Haïti" }).check();
 await page.getByLabel("Nom du destinataire", { exact: true }).fill("Marie Test");
 await page.getByLabel("Téléphone mobile en Haïti", { exact: true }).fill("+509 3412 3456");
 await page.getByLabel("Commune et quartier de remise", { exact: true }).fill("Jacmel, centre");
 const pay = page.getByRole("button", { name: /Payer/ }).first();
 await pay.click(); expect(posted).toBeNull();
 await page.getByRole("checkbox", { name: /J’ai l’accord/ }).check();
 await expect(page.getByText("Destinataire de cette commande", { exact: true })).toBeVisible();
 await pay.click();
 await expect.poll(() => posted).not.toBeNull();
 expect(posted!.recipient).toMatchObject({ name: "Marie Test", phone: "+509 3412 3456", consent: true });
 await expect(page.getByLabel("Nom du destinataire", { exact: true })).toHaveValue("Marie Test");
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
 await page.screenshot({ path: testInfo.outputPath("diaspora-mobile.png"), fullPage: true });
});
test("le serveur refuse une cible invalide et conserve la tentative si sa sauvegarde échoue", async ({ page, request }) => {
 await connecte(page, "recipient-api");
 // A retry shares the stub process with the first run. Observe this attempt
 // only, while exercising the same persisted order/payment after failure.
 const checkoutKey = randomUUID();
 const orderId = checkoutOrderId("11111111-1111-1111-1111-111111111111", checkoutKey);
 const writes = async () => (await request.get(`http://127.0.0.1:15421/__gift-writes?order_id=${orderId}`)).json();
 const recipient = { name: " Marie Test ", phone: "+509 3412 3456", locality: " Jacmel ", note: " Près de la place ", consent: true };
 const data = { productId: "99999999-9999-9999-9999-999999999990", recipient, checkoutKey };
 const invalid = await page.request.post("/api/checkout", { data: { ...data, recipient: { ...recipient, consent: false } } });
 expect(invalid.status()).toBe(422);
 expect(await writes()).toEqual([]);
 const failed = await page.request.post("/api/checkout", { data });
 expect(failed.status()).toBe(503);
 const events = await writes();
 // Payment ownership precedes private metadata. No DELETE, reservation,
 // confirmation or saved operator session may follow the failed write.
 expect(events.map((e: { step: string }) => e.step)).toEqual(["order", "payment", "recipient"]);
 expect(events[0].body).toMatchObject({ id: orderId, status: "pending", amount_htg: 1500 });
 expect(events[1].body).toMatchObject({ order_id: orderId, idempotency_key: orderId, rail: "moncash", status: "pending" });
 expect(events[1].body.raw.checkout_intent_hash).toMatch(/^[0-9a-f]{64}$/);
 expect(events[1].body.raw.checkout_redirect_url).toBeUndefined();
 expect(events[2].body).toEqual({ order_id: orderId, full_name: "Marie Test", phone: "34123456", locality: "Jacmel", note: "Près de la place" });
 const recovery = await page.request.post("/api/checkout", { data: { productId: data.productId, checkoutKey, recoveryOnly: true } });
 expect(recovery.status()).toBe(200);
 const result = await recovery.json();
 expect(result).toMatchObject({ orderId, deja: true, orderStatus: "pending", paymentStatus: "pending", checkoutState: "pending", redirectUrl: `/paiement/en-attente?commande=${orderId}` });
 expect(result.retryAllowed).toBeUndefined();
 expect(await writes()).toEqual(events);
 const replay = await page.request.post("/api/checkout", { data });
 expect(replay.status()).toBe(200);
 expect(await replay.json()).toMatchObject({ orderId, deja: true, checkoutState: "pending", redirectUrl: `/paiement/en-attente?commande=${orderId}` });
 const replayWrites = await writes();
 expect(replayWrites.slice(events.length).map((e: { step: string }) => e.step)).toEqual(["order"]);
 expect(replayWrites.filter((e: { step: string }) => e.step === "payment")).toHaveLength(1);
 expect(replayWrites.filter((e: { step: string }) => e.step === "recipient")).toHaveLength(1);
});
