import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  autoReceivedNoticeEmail,
  buyerPurchaseEmail,
  reminderNoticeEmail,
  sellerSaleEmail,
  shippedNoticeEmail,
} from "../lib/zabelie-email";
import { echapperHtml } from "../lib/echapper-html";
import { KYC_EXTENSIONS, KYC_TYPE_PAR_EXTENSION, signatureKycValide } from "../lib/kyc";

/**
 * ÉCHAPPEMENT DES E-MAILS ET TYPES DES PIÈCES KYC (revue de sécurité du
 * 2026-10-14).
 *
 *  E1  chaque gabarit d'e-mail échappe CHAQUE valeur qu'il reçoit ;
 *  E2  une seule implémentation de l'échappement, partagée ;
 *  K1  la signature des premiers octets : connus-positifs et connus-négatifs ;
 *  K2  la route vérifie le contenu AVANT d'écrire, et impose le type serveur ;
 *  K3  code et migration 0140 autorisent exactement les mêmes types.
 *
 * Chaque garde a été rougie par une mutation avant d'être crue.
 */

const RACINE = join(import.meta.dirname, "..");
const lire = (p: string) => readFileSync(join(RACINE, p), "utf8");
const sansCommentairesTs = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

// Une valeur piégée dans CHAQUE champ texte : si un seul champ passe brut, la
// balise ressort telle quelle dans le HTML.
const P = `<i data-p="1">x</i> & "q" 'a'`;
const echappe = echapperHtml(P);

test("E1 — chaque gabarit échappe chaque valeur reçue", () => {
  const gabarits: Array<[string, { html: string }]> = [
    ["achat", buyerPurchaseEmail({ productTitle: P, amountLabel: P, purchasesUrl: P })],
    ["vente", sellerSaleEmail({ productTitle: P, netLabel: P, dashboardUrl: P, orderRef: P })],
    ["remise", shippedNoticeEmail({ productTitle: P, orderRef: P, deadlineLabel: P, purchasesUrl: P })],
    ["rappel", reminderNoticeEmail({ productTitle: P, orderRef: P, deadlineLabel: P, purchasesUrl: P })],
    ["reçu", autoReceivedNoticeEmail({ productTitle: P, orderRef: P, purchasesUrl: P })],
  ];
  for (const [nom, { html }] of gabarits) {
    assert.ok(!html.includes("<i data-p"), `${nom} : une valeur entre brute dans le HTML`);
    assert.ok(html.includes(echappe), `${nom} : la valeur échappée est absente`);
  }
  assert.equal(echappe, "&lt;i data-p=&quot;1&quot;&gt;x&lt;/i&gt; &amp; &quot;q&quot; &#39;a&#39;");
});

test("E2 — une seule implémentation de l'échappement HTML", () => {
  const copies = readdirSync(join(RACINE, "lib"))
    .filter((f) => f.endsWith(".ts") && f !== "echapper-html.ts")
    .filter((f) => /"&lt;"|&lt;"\)/.test(sansCommentairesTs(lire(`lib/${f}`))));
  assert.deepEqual(copies, [], `échappement recopié hors de lib/echapper-html.ts : ${copies.join(", ")}`);
  for (const f of ["lib/zabelie-email.ts", "lib/messagerie-notify.ts", "lib/relances-paiement.ts", "lib/alertes.ts"]) {
    assert.match(lire(f), /import \{ echapperHtml \} from "(\.\/|@\/lib\/)echapper-html";/, `${f} n'utilise pas le module partagé`);
  }
});

test("K1 — signature des premiers octets : positifs et négatifs", () => {
  const o = (...b: number[]) => new Uint8Array(b);
  const texte = (s: string) => new TextEncoder().encode(s);
  assert.ok(signatureKycValide("jpg", o(0xff, 0xd8, 0xff, 0xe0)));
  assert.ok(signatureKycValide("jpeg", o(0xff, 0xd8, 0xff, 0xdb)));
  assert.ok(signatureKycValide("png", o(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)));
  assert.ok(signatureKycValide("webp", texte("RIFF\x00\x00\x00\x00WEBP")));
  assert.ok(signatureKycValide("pdf", texte("%PDF-1.7")));
  // Connus-négatifs : un texte ou une page renommés, une signature d'un autre type.
  assert.ok(!signatureKycValide("pdf", texte("<html><body>")));
  assert.ok(!signatureKycValide("jpg", texte("<svg xmlns=")));
  assert.ok(!signatureKycValide("png", o(0xff, 0xd8, 0xff, 0xe0)));
  assert.ok(!signatureKycValide("webp", texte("RIFF\x00\x00\x00\x00WAVE")));
  assert.ok(!signatureKycValide("pdf", o()));
  assert.ok(!signatureKycValide("gif", texte("GIF89a")));
});

test("K2 — la route vérifie le contenu avant d'écrire, et impose le type serveur", () => {
  const route = sansCommentairesTs(lire("app/api/kyc/route.ts"));
  assert.match(route, /const entete = new Uint8Array\(await file\.slice\(0, 12\)\.arrayBuffer\(\)\);\s*if \(!signatureKycValide\(ext, entete\)\) \{\s*return erreurTraduite\("api\.kyc\.format", 422\);/);
  assert.match(route, /const contentType = KYC_TYPE_PAR_EXTENSION\[ext\];/);
  assert.match(route, /\.upload\(path, file, \{ contentType \}\)/);
  assert.doesNotMatch(route, /file\.type/, "le type déclaré par le navigateur ne doit plus servir");
  assert.ok(route.indexOf("signatureKycValide(ext, entete)") < route.indexOf(".upload(path, file"), "la vérification doit précéder l'écriture");
});

test("K3 — code et migration 0140 autorisent exactement les mêmes types", () => {
  assert.deepEqual(Object.keys(KYC_TYPE_PAR_EXTENSION).sort(), [...KYC_EXTENSIONS].sort());
  const sql = lire("supabase/migrations/0140_zabelie_kyc_types.sql").replace(/--.*$/gm, "");
  const m = /set allowed_mime_types = array\[([^\]]+)\]\s*where id = 'kyc-documents';/.exec(sql);
  assert.ok(m, "0140 ne règle pas allowed_mime_types de kyc-documents");
  const migration = [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]).sort();
  assert.deepEqual(migration, [...new Set(Object.values(KYC_TYPE_PAR_EXTENSION))].sort());
});
