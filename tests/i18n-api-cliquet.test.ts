import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * LES MESSAGES D'API EN DUR — UN CLIQUET, PAS UN GEL.
 *
 * ⚠️ NÉ D'UNE DEMANDE DU PORTEUR, le 2026-08-22 : « assure-toi que cela soit
 * dans toutes les langues », après avoir reçu à l'écran une contrainte
 * Postgres brute — `violates check constraint "products_delivery_days_check"`.
 *
 * MESURÉ AVANT DE COMMENCER : **350 occurrences, 163 messages distincts, 60
 * fichiers**. Les traduire tous d'un coup aurait produit 652 chaînes écrites à
 * la chaîne, dont un quart de kreyòl de qualité douteuse — et le kreyòl est la
 * langue de référence du produit, pas une case à cocher.
 *
 * Ce fichier fait donc ce qu'un inventaire honnête sait faire : il empêche le
 * nombre de MONTER, et il oblige à le faire descendre. Le chantier se traite
 * route par route, sans que rien ne régresse entre deux passes.
 *
 * ── POURQUOI LA TRADUCTION EST CÔTÉ SERVEUR ─────────────────────────────────
 * `lib/api-erreur.ts` et l'usage direct de `t(lang, …)` produisent un message
 * déjà traduit dans `{ error }`. Les ~60 appelants clients font tous
 * `data.error` : **aucun ne change**, et une route non encore convertie
 * continue de fonctionner en français au lieu de casser. C'est la seule forme
 * qui permet une conversion progressive.
 */

/** Retire les commentaires : un motif ne doit jamais compter de la prose. */
function sansCommentaires(s: string): string {
  return s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
}

function modules(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(dir).sort()) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) modules(p, acc);
    else if (p.endsWith(".ts")) acc.push(p);
  }
  return acc;
}

const EN_DUR = /error:\s*\n?\s*"[^"]{6,}"/g;

function compter(): { total: number; parFichier: Map<string, number> } {
  const parFichier = new Map<string, number>();
  let total = 0;
  for (const f of modules("app/api")) {
    const n = (sansCommentaires(readFileSync(f, "utf8")).match(EN_DUR) ?? []).length;
    if (n > 0) {
      parFichier.set(f, n);
      total += n;
    }
  }
  return { total, parFichier };
}

/**
 * PLAFOND — mesuré le 2026-08-22, après conversion des trois routes que le
 * porteur traverse (`products`, `checkout`, `admin/product-status`).
 *
 * ⚠️ NE JAMAIS RELEVER CE NOMBRE. Il ne descend que par du travail réel ; le
 * monter reviendrait à transformer un cliquet en décoration. Si une route neuve
 * a besoin d'un message, elle le prend dans `lib/i18n.ts` — c'est deux minutes,
 * et c'est le prix de ne pas laisser un vendeur kreyòl lire du français.
 */
const PLAFOND = 332;

/** Routes déjà converties : elles ne doivent JAMAIS régresser. */
const CONVERTIES = [
  "app/api/products/route.ts",
  "app/api/checkout/route.ts",
  "app/api/admin/product-status/route.ts",
];

test("A0 — l'inventaire a lu le dépôt, pas le vide", () => {
  // « aucun message en dur » et « rien lu » ne doivent pas se ressembler.
  const fichiers = modules("app/api");
  assert.ok(fichiers.length >= 40, `routes lues : ${fichiers.length}`);
});

test("A1 — le nombre de messages en dur ne MONTE pas", () => {
  const { total } = compter();
  assert.ok(
    total <= PLAFOND,
    `Messages d'API en dur : ${total} — le plafond est ${PLAFOND}.\n` +
      "Une route neuve ne doit pas ajouter de français en dur : prenez une clé " +
      "dans `lib/i18n.ts` et rendez `t(lang, cle)` (voir `lib/api-erreur.ts`).\n" +
      "⚠️ Ne relevez PAS le plafond : il ne descend que par du travail réel."
  );
});

test("A2 — le plafond n'est pas devenu périmé (il doit suivre la baisse)", () => {
  const { total } = compter();
  assert.ok(
    total >= PLAFOND - 40,
    `Messages en dur : ${total}, plafond ${PLAFOND} — l'écart dépasse 40.\n` +
      "Du travail a été fait sans mettre le plafond à jour. Un plafond qui ne " +
      "suit pas la baisse cesse de mordre : abaissez-le à la valeur mesurée.\n" +
      "C'est la même règle que les exemptions du dépôt — elles se périment " +
      "dans les DEUX sens."
  );
});

test("A3 — les routes déjà traduites ne régressent pas", () => {
  const { parFichier } = compter();
  const regressees = CONVERTIES.filter((f) => (parFichier.get(f) ?? 0) > 0);
  assert.deepEqual(
    regressees,
    [],
    "Message en dur réintroduit dans une route DÉJÀ traduite : " +
      regressees.join(", ") +
      ".\nCes routes sont celles que le porteur traverse — publication, achat, " +
      "mise en vente. Un français en dur y renvoie un vendeur kreyòl à la " +
      "case départ."
  );
});

test("A4 — les clés d'API existent dans les QUATRE langues", () => {
  // Le type `Record<I18nKey, string>` couvre `ht`, mais pas `en` ni `es` :
  // seule `ht` est typée. Sans ce contrôle, une clé pourrait n'exister qu'en
  // français et en kreyòl, et `t(lang, cle)` rendrait un vide en anglais.
  const src = readFileSync("lib/i18n.ts", "utf8");
  const cles = [...new Set([...src.matchAll(/"(api\.[a-z.]+)":/g)].map((m) => m[1]))];
  assert.ok(cles.length >= 20, `clés api.* trouvées : ${cles.length}`);

  const incompletes = cles.filter(
    (k) => (src.match(new RegExp(`"${k.replace(/\./g, "\\.")}":`, "g")) ?? []).length !== 4
  );
  assert.deepEqual(
    incompletes,
    [],
    "Clé d'API absente d'au moins une langue : " +
      incompletes.join(", ") +
      ".\nQuatre langues : fr, ht, en, es. Le kreyòl est la langue de " +
      "référence du produit, pas une case à cocher."
  );
});
