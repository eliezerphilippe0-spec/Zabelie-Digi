import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * AUDIT DU 2026-10-27, LOT 4 — accessibilité des formulaires, états
 * sélectionnés et cibles tactiles. Constats mesurés au rendu (Chromium,
 * 360/768/1280 px) au commit acc72c9.
 *
 * Chaque garde porte sur ce qui COMMANDE (l'attribut, la classe dans
 * l'élément qui la reçoit, la condition) et a été éprouvée par une mutation
 * connue-négative, notée au-dessus d'elle.
 */

const lire = (f: string) => readFileSync(f, "utf8");

/** Commentaires retirés : les gardes ne doivent pas se satisfaire de la prose. */
function code(src: string): string {
  return src.replace(/\{\/\*[\s\S]*?\*\/\}|\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
}

/** Les éléments `<balise …>` entiers (jusqu'à la fin de la balise ouvrante). */
function balises(src: string, nom: string): string[] {
  return [...src.matchAll(new RegExp(`<${nom}\\b(?:[^>"'{}]|"[^"]*"|\\{[^{}]*(?:\\{[^{}]*\\}[^{}]*)*\\})*>`, "g"))].map((m) => m[0]);
}

const classes = (el: string): string[] => (el.match(/className="([^"]*)"/)?.[1] ?? "").split(/\s+/).filter(Boolean);

// ── M8 — les pièces d'identité se déposent au clavier ──────────────────────
/*
 * MESURÉ : trois `<input type="file" className="hidden">` sur
 * /tableau-de-bord/compte — `display: none`, donc hors de l'ordre de
 * tabulation, dans un libellé de ~30 px. Le retrait d'argent attend ce
 * dossier : un vendeur au clavier ou au lecteur d'écran ne pouvait pas être payé.
 *
 * Mutations éprouvées :
 *   `className="sr-only"` → `className="hidden"`                        → K1 rouge
 *   `min-h-11` retiré du libellé                                        → K2 rouge
 *   `{busy ? labels.sending` → `{false ? labels.sending`               → K3 rouge
 *   `role="alert"` retiré de l'erreur                                   → K3 rouge
 */

const KYC = code(lire("components/kyc-form.tsx"));

test("K1 — les trois champs de pièce sont joignables au clavier (sr-only, jamais hidden)", () => {
  const champs = balises(KYC, "input").filter((i) => /\btype="file"/.test(i));
  assert.equal(champs.length, 1, "un seul <input type=file>, rendu pour chaque pièce par la boucle");
  assert.match(KYC, /\(\["cin", "paspo", "selfie"\] as KycType\[\]\)\.map\(\(k\) => \(/, "la boucle des trois pièces a changé");
  assert.deepEqual(classes(champs[0]), ["sr-only"], `champ fichier : « ${classes(champs[0]).join(" ")} »`);
});

test("K2 — le libellé qui porte le champ fait 44 px et dessine l'anneau de focus", () => {
  const m = KYC.match(/<label\b[^>]*className="([^"]*)"[^>]*>(?:(?!<\/label>)[\s\S])*?<input\s+type="file"/);
  assert.ok(m, "le champ fichier n'est plus DANS son libellé");
  const c = m[1].split(/\s+/);
  for (const attendu of ["min-h-11", "inline-flex", "items-center", "has-[:focus-visible]:outline", "has-[:focus-visible]:outline-2", "has-[:focus-visible]:outline-accent"]) {
    assert.ok(c.includes(attendu), `libellé KYC sans « ${attendu} » : « ${m[1]} »`);
  }
});

test("K3 — l'envoi est annoncé (role=status, présente avant l'envoi) et l'échec aussi (role=alert)", () => {
  // La région existe TOUJOURS dans la rangée, et c'est `busy` qui la remplit.
  assert.match(KYC, /<p role="status" className="sr-only">\s*\{busy \? labels\.sending : \(depose \?\? ""\)\}\s*<\/p>/);
  // Le texte du succès vient de l'envoi réussi, pas d'ailleurs.
  assert.match(KYC, /setPieces\(\(p\) => \[\.\.\.p, \{ id: data\.id, kind \}\]\);\s*setDepose\(`\$\{libelle\[kind\]\} : \$\{labels\.deposited\}`\);/);
  assert.match(KYC, /\{error && <p role="alert" className="[^"]*">\{error\}<\/p>\}/);
});

// ── m2 — l'échec de paiement est annoncé ───────────────────────────────────
/*
 * `cart-pay-all.tsx` annonçait son erreur (`role="alert"`), `buy-button.tsx`
 * — le même chemin, depuis la fiche — non : un acheteur au lecteur d'écran
 * appuyait sur « Payer » et n'entendait rien.
 *
 * Mutation éprouvée : `role="alert"` retiré de l'erreur                → P1 rouge
 */

const BOUTON = code(lire("components/buy-button.tsx"));

test("P1 — l'erreur de paiement de la fiche est annoncée, comme celle du panier", () => {
  // L'élément rendu PAR la condition `error &&`, pas un rôle ailleurs dans le fichier.
  assert.match(BOUTON, /\{error && <p role="alert" className="[^"]*">\{error\}<\/p>\}/);
  assert.match(code(lire("components/cart-pay-all.tsx")), /\{msg && <p role="alert" /, "le panier a perdu le motif de référence");
});
