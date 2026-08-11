import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * L'HÔTE MONCASH EST `digicelgroup.com` — ET LE VIEUX DOMAINE EST BANNI.
 *
 * Mesuré le 2026-08-10, de l'extérieur : `sandbox.moncashbutton.digicel.com`
 * ne résout plus (DNS mort, curl 000), tandis que
 * `sandbox.moncashbutton.digicelgroup.com` rend 401 sur /Api/oauth/token,
 * /Api/v1/CreatePayment et /Api/v1/RetrieveTransactionPayment — le serveur
 * existe et exige l'authentification. Le code pointait sur le domaine mort :
 * le premier test sandbox aurait échoué en erreur réseau, et une erreur
 * réseau sur le rail de paiement principal ressemble à tout SAUF à une
 * faute de domaine.
 *
 * Le piège qui justifie un garde : `digicel.com` est une SOUS-CHAÎNE de
 * `digicelgroup.com` — un grep naïf du bon domaine « voit » aussi le
 * mauvais. D'où la frontière exacte ci-dessous.
 */
test("lib/moncash.ts ne référence que l'hôte digicelgroup.com", () => {
  // Commentaires DÉCAPÉS avant la mesure : l'en-tête de lib/moncash.ts cite
  // légitimement le domaine mort en prose (il documente la panne) — le garde
  // vise le code exécutable, pas son histoire.
  const src = readFileSync("lib/moncash.ts", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  // Connu-positif du motif : il détecte bien le domaine mort seul.
  const mort = /moncashbutton\.digicel\.com/;
  assert.match("https://sandbox.moncashbutton.digicel.com/Api", mort);
  assert.doesNotMatch("https://sandbox.moncashbutton.digicelgroup.com/Api", mort);

  assert.doesNotMatch(
    src,
    mort,
    "lib/moncash.ts référence moncashbutton.digicel.com — ce domaine ne résout plus, l'hôte est digicelgroup.com"
  );
  assert.ok(
    src.includes("moncashbutton.digicelgroup.com"),
    "l'hôte digicelgroup.com a disparu de lib/moncash.ts"
  );
});
