import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { whatsappHref } from "../lib/whatsapp";

/**
 * Le lien WhatsApp plateforme n'existe que si le porteur a posé le numéro.
 *
 * Contrat vérifié dans les deux sens (règle du dépôt) : env absente → null,
 * et toute surface consommatrice se masque ; env posée → lien wa.me normalisé.
 * Un bouton de contact qui ouvre une conversation avec personne est pire que
 * pas de bouton.
 */

test("sans NEXT_PUBLIC_WHATSAPP_NUMBER : null — la surface doit se masquer", () => {
  delete process.env.NEXT_PUBLIC_WHATSAPP_NUMBER;
  assert.equal(whatsappHref(), null);
  assert.equal(whatsappHref("Bonjou"), null);
});

test("numéro posé : lien wa.me normalisé (sans +, sans espaces)", () => {
  process.env.NEXT_PUBLIC_WHATSAPP_NUMBER = "+509 12 34 5678";
  assert.equal(whatsappHref(), "https://wa.me/50912345678");
  assert.equal(
    whatsappHref("Bonjou Zabelie"),
    "https://wa.me/50912345678?text=Bonjou%20Zabelie"
  );
  delete process.env.NEXT_PUBLIC_WHATSAPP_NUMBER;
});

test("numéro tronqué : null — un fragment n'est pas un numéro", () => {
  process.env.NEXT_PUBLIC_WHATSAPP_NUMBER = "509";
  assert.equal(whatsappHref(), null);
  delete process.env.NEXT_PUBLIC_WHATSAPP_NUMBER;
});

// ── Le lien court Business (décision porteur 2026-08-14 : numéro caché) ─────

test("lien court posé : il gagne sur le numéro, et le prefill est ignoré", () => {
  process.env.NEXT_PUBLIC_WHATSAPP_LINK = "https://wa.me/message/ABCD1234";
  process.env.NEXT_PUBLIC_WHATSAPP_NUMBER = "+509 12 34 5678";
  // Le lien court porte son propre message d'accueil (configuré dans l'app
  // Business) — le texte par page ne peut pas s'y greffer, et surtout le
  // NUMÉRO ne doit apparaître nulle part dans le href rendu.
  assert.equal(whatsappHref("Bonjou"), "https://wa.me/message/ABCD1234");
  assert.ok(!whatsappHref("Bonjou")!.includes("50912345678"));
  delete process.env.NEXT_PUBLIC_WHATSAPP_LINK;
  delete process.env.NEXT_PUBLIC_WHATSAPP_NUMBER;
});

test("lien invalide (pas WhatsApp) : ignoré, repli sur le numéro — jamais un lien arbitraire", () => {
  process.env.NEXT_PUBLIC_WHATSAPP_LINK = "https://example.com/piege";
  process.env.NEXT_PUBLIC_WHATSAPP_NUMBER = "+509 12 34 5678";
  assert.equal(whatsappHref(), "https://wa.me/50912345678");
  delete process.env.NEXT_PUBLIC_WHATSAPP_LINK;
  delete process.env.NEXT_PUBLIC_WHATSAPP_NUMBER;
});

test("le numéro n'est plus AFFICHÉ nulle part — whatsappAffichage est morte", () => {
  /* La suppression de la fonction est le garde (tsc casse tout appelant),
   * mais un affichage recodé À CÔTÉ ne casserait rien : on vérifie donc
   * aussi que l'accueil ne rend plus le numéro en clair. */
  const page = readFileSync("app/page.tsx", "utf8");
  assert.ok(!page.includes("whatsappAffichage"), "l'accueil référence encore l'affichage du numéro");
});
