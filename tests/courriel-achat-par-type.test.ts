import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buyerPurchaseEmail } from "../lib/zabelie-email";
import { achatTelechargeable, cleCorpsAchat } from "../lib/achat-confirme";
import { DICT } from "../lib/i18n";
import { echapperHtml } from "../lib/echapper-html";
import { KIND_FILE, KIND_PHYSICAL, KIND_SERVICE, PRODUCT_KINDS } from "../lib/product-kind";

/**
 * LE COURRIEL DE CONFIRMATION DIT CE QUI A ÉTÉ ACHETÉ (audit 2026-11-10, P0-4).
 *
 * Il promettait un téléchargement à tout le monde. Un acheteur d'objet qui lit
 * « Fichye ou disponib » cherche un fichier qui n'existe pas, puis doute du
 * paiement qu'on vient de lui confirmer.
 *
 * L'instrument est éprouvé dans les deux sens : le motif « téléchargement »
 * doit TROUVER le courriel d'un fichier (connu-positif) avant qu'on lise son
 * silence sur les autres. Pas de `\b` : « Telechaje » et « Fichye » sont du
 * kreyòl, et le motif doit les voir (CLAUDE.md, « `\b` ne connaît pas le kreyòl »).
 */
const TELECHARGEMENT = /t[eé]l[eé]cha|fich(ye|ier)/iu;
const courriel = (kind: string | null) =>
  buyerPurchaseEmail({ productTitle: "Produit", amountLabel: "1 500 HTG", purchasesUrl: "https://zabelie.com/mes-achats", kind }).html;
const texte = (lang: "ht" | "fr", cle: string) => echapperHtml((DICT[lang] as Record<string, string>)[cle]);

test("connu-positif : le courriel d'un fichier parle bien de téléchargement, en kreyòl et en français", () => {
  const html = courriel(KIND_FILE);
  assert.match(html, TELECHARGEMENT);
  assert.match(html, /Telechaje/u);
  assert.match(html, /Télécharger/u);
  assert.ok(html.includes(texte("ht", "pay.ok.body.file")) && html.includes(texte("fr", "pay.ok.body.file")));
});

test("un objet ou une prestation ne reçoit AUCUNE promesse de fichier, et reçoit son propre texte", () => {
  for (const [kind, cle] of [[KIND_PHYSICAL, "pay.ok.body.physical"], [KIND_SERVICE, "pay.ok.body.service"]] as const) {
    const html = courriel(kind);
    assert.doesNotMatch(html, TELECHARGEMENT, `${kind} : le courriel parle encore de fichier`);
    assert.ok(html.includes(texte("ht", cle)), `${kind} : texte kreyòl attendu absent`);
    assert.ok(html.includes(texte("fr", cle)), `${kind} : texte français attendu absent`);
    assert.ok(html.includes(texte("ht", "pay.ok.cta")) && html.includes(texte("fr", "pay.ok.cta")), `${kind} : bouton neutre absent`);
  }
});

test("un type inconnu ou absent reçoit le texte neutre : on ne devine pas", () => {
  for (const kind of [null, "", "abonnement"]) {
    const html = courriel(kind);
    assert.doesNotMatch(html, TELECHARGEMENT);
    assert.ok(html.includes(texte("fr", "pay.ok.body")) && html.includes(texte("ht", "pay.ok.body")));
    assert.equal(achatTelechargeable(kind), false);
  }
});

test("chaque type de l'énumération a un texte à lui, distinct du neutre", () => {
  const cles = PRODUCT_KINDS.map((k) => cleCorpsAchat(k));
  assert.equal(new Set(cles).size, PRODUCT_KINDS.length);
  assert.ok(!cles.includes("pay.ok.body"));
  for (const lang of ["fr", "ht", "en", "es"] as const) {
    for (const cle of [...cles, "pay.ok.body", "pay.ok.cta"]) assert.ok((DICT[lang] as Record<string, string>)[cle], `${lang} : ${cle} manquant`);
  }
});

// ── Le type arrive-t-il jusqu'au gabarit ? ────────────────────────────────
// Un gabarit juste nourri d'un type absent enverrait le texte neutre à tous :
// vert partout, et plus personne ne reçoit le lien de téléchargement.
const sansCommentaires = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const NOTIFY = sansCommentaires(readFileSync("lib/zabelie-notify.ts", "utf8"));

test("les deux lectures de commande demandent `kind`, et le passent au gabarit", () => {
  assert.equal((NOTIFY.match(/products!orders_product_id_fkey\(title, seller_id, kind\)/g) ?? []).length, 2, "envoi initial : lecture principale et lecture de repli");
  assert.match(NOTIFY, /buyerPurchaseEmail\(\{[\s\S]{0,200}?kind: product\.kind \?\? null,\s*\}\)/);
  assert.match(NOTIFY, /products!orders_product_id_fkey\(title, kind\)/, "renvoi par le drain de l'outbox");
  assert.match(NOTIFY, /const typeAchat = \(Array\.isArray\(p\) \? p\[0\]\?\.kind : p\?\.kind\) \?\? null;[\s\S]{0,400}buyerPurchaseEmail\(\{[\s\S]{0,200}?kind: typeAchat,\s*\}\)/);
});

test("la table du courriel et celle de la page de succès disent la même chose", () => {
  const page = sansCommentaires(readFileSync("app/paiement/succes/page.tsx", "utf8"));
  for (const [nom, kind] of [["file", KIND_FILE], ["service", KIND_SERVICE], ["physical", KIND_PHYSICAL]] as const) {
    const m = page.match(new RegExp(`${nom}: "(pay\\.ok\\.body\\.[a-z]+)"`));
    assert.ok(m, `page de succès : entrée ${nom} introuvable`);
    assert.equal(cleCorpsAchat(kind), m[1], `${nom} : le courriel et la page divergent`);
  }
  assert.match(page, /if \(!isProductKind\(kind\)\) return "pay\.ok\.body";/);
});
