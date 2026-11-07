import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * LES ÉCHELLES DU THÈME — chantier design, Phase 1.4 (V-25 A7, A8, A9).
 *
 * Trois rayons et le rond, trois ombres, des plans de superposition nommés.
 * Mécanique, et volontairement : un cran hors échelle ne casse rien et se voit
 * partout. Il se garde par un comptage, comme il a été trouvé.
 *
 * Le chemin de l'argent n'est pas modifié par ce chantier (brief §1.8). Ses
 * fichiers gardent `rounded-2xl`, que le thème fait valoir `rounded-xl` : ils
 * suivent sans être touchés. La liste se périme dans les deux sens.
 */

const RACINE = join(import.meta.dirname, "..");
const lire = (p: string) => readFileSync(join(RACINE, p), "utf8");

function tsx(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(join(RACINE, dir))) {
    const rel = `${dir}/${e}`;
    if (statSync(join(RACINE, rel)).isDirectory()) tsx(rel, acc);
    else if (e.endsWith(".tsx")) acc.push(rel);
  }
  return acc;
}
const SOURCES = [...tsx("app"), ...tsx("components")];
const THEME = lire("app/zabelie-theme.css");

/** Commentaires retirés : expliquer une règle n'est pas l'enfreindre. */
const code = (s: string) => s.replace(/\{\/\*[\s\S]*?\*\/\}|\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

const CHEMIN_ARGENT = [
  "app/admin/kyc/kyc-admin.tsx",
  "app/admin/paiements-vendeurs/page.tsx",
  "app/facture/[token]/page.tsx",
  "app/paiement/zelle/[orderId]/page.tsx",
  "app/rechaj/page.tsx",
  "app/rechaj/[orderId]/page.tsx",
  "components/business/invoice-editor.tsx",
  "components/buy-button.tsx",
  "components/cart-pay-all.tsx",
  "components/kyc-form.tsx",
  "components/payout-queue.tsx",
];

const RAYON_RETIRE = /(?<![\w-])(?:[a-z-]+:)*rounded(?:-[tblrse]{1,2})?-(?:2xl|3xl)(?![\w-])/;
const OMBRE_RETIREE = /(?<![\w-])(?:[a-z-]+:)*shadow-(?:xl|2xl|\[[^\]]+\])/;
const PLAN_BRUT = /(?<![\w-])(?:[a-z-]+:)*-?z-(?:\d+|\[[^\]]+\])(?![\w-])/;

test("E0 — les détecteurs discriminent", () => {
  assert.ok(RAYON_RETIRE.test('className="rounded-2xl p-4"'));
  assert.ok(RAYON_RETIRE.test('className="sm:rounded-3xl"'));
  assert.ok(RAYON_RETIRE.test('className="rounded-t-2xl"'));
  assert.ok(!RAYON_RETIRE.test('className="rounded-xl rounded-card rounded-lg rounded-full"'));
  assert.ok(OMBRE_RETIREE.test('className="shadow-xl"'));
  assert.ok(OMBRE_RETIREE.test('className="shadow-[0_1px_2px_red]"'));
  assert.ok(!OMBRE_RETIREE.test('className="shadow-sm shadow-md shadow-lg"'));
  assert.ok(PLAN_BRUT.test('className="z-50"'));
  assert.ok(PLAN_BRUT.test('className="focus:z-[60]"'));
  assert.ok(!PLAN_BRUT.test('className="z-(--z-header)"'));
  assert.ok(!PLAN_BRUT.test('className="size-4 grid-z-1"'));
});

test("E1 — rayons : `rounded-2xl` et `rounded-3xl` ne vivent plus que sur le chemin de l'argent", () => {
  assert.ok(SOURCES.length > 200, `${SOURCES.length} fichiers lus`);
  const fautes = SOURCES.filter((f) => !CHEMIN_ARGENT.includes(f) && RAYON_RETIRE.test(code(lire(f))));
  assert.deepEqual(fautes, [], "cran retiré (V-25 A7) : rounded-lg 8, rounded-card 12, rounded-xl 20");
  const perimees = CHEMIN_ARGENT.filter((f) => !RAYON_RETIRE.test(code(lire(f))));
  assert.deepEqual(perimees, [], "exception devenue inutile : à retirer de CHEMIN_ARGENT");
});

test("E2 — le thème fait valoir `2xl` et `3xl` comme `xl`, et écrit la règle", () => {
  assert.match(THEME, /--radius-2xl: var\(--radius-xl\);/);
  assert.match(THEME, /--radius-3xl: var\(--radius-xl\);/);
  assert.match(THEME, /--radius-xl: 1\.25rem;/);
  assert.match(THEME, /--radius-card: 0\.75rem;/);
  assert.match(THEME, /--radius-full: 9999px;/);
});

test("E3 — ombres : trois niveaux, teintés, avec leur couleur sombre", () => {
  const fautes = SOURCES.filter((f) => OMBRE_RETIREE.test(code(lire(f))));
  assert.deepEqual(fautes, [], "ombre hors échelle : shadow-sm, shadow-md ou shadow-lg");
  for (const n of ["sm", "md", "lg"]) {
    assert.match(THEME, new RegExp(`--shadow-${n}: [^;]*var\\(--color-ombre\\);`), `--shadow-${n} ne lit plus la couleur d'ombre`);
  }
  const coupe = THEME.indexOf('[data-theme="dark"]');
  assert.match(THEME.slice(0, coupe), /--color-ombre: rgb\(23 18 58 \/ 0\.14\);/, "teinte indigo en clair");
  assert.match(THEME.slice(coupe), /--color-ombre: rgb\(7 5 5 \/ 0\.5\);/, "V-25 A4 : chaque ombre a sa valeur sombre");
});

test("E4 — plans de superposition nommés, aucun chiffre brut dans le TSX ni dans les feuilles", () => {
  const fautes = SOURCES.filter((f) => PLAN_BRUT.test(code(lire(f))));
  assert.deepEqual(fautes, [], "plan brut : z-(--z-header), z-(--z-drawer), z-(--z-modal), z-(--z-toast), z-(--z-sticky)");
  for (const t of ["--z-base: 1", "--z-sticky: 10", "--z-drawer: 40", "--z-header: 50", "--z-modal: 60", "--z-toast: 70"]) {
    assert.ok(THEME.includes(t), `${t} absent du thème`);
  }
  for (const f of ["app/home-discovery.css", "app/home-vivant.css", "app/editorial-marketplace.css", "app/globals.css"]) {
    assert.doesNotMatch(lire(f), /z-index:\s*-?\d/, `${f} porte un z-index en chiffre`);
  }
});
