import { test } from "node:test";
import assert from "node:assert/strict";
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
