import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { surCheminArgent } from "./helpers/chemin-argent";
import { attribut, balises, classes } from "./helpers/balises-jsx";

/**
 * CHAMPS DE FORMULAIRE — chantier design, Phase 2.2 (`docs/design/PHASE-2.md`).
 *
 * Le brief : libellé toujours visible, 48 px au moins, `inputmode` et
 * `autocomplete` justes, erreur sous le champ en texte ET icône, anneau de
 * focus de 2 px à 3:1 au moins. Avant : 80 champs écrits à la main, la plupart
 * en 14 px (Safari zoome la page au focus sous 16 px), bordés de `--line`
 * (1,2:1), souvent en `outline-none` qui éteignait l'anneau ; 26 champs publics
 * nommés pour les seuls lecteurs d'écran ; 39 erreurs en texte rouge sans icône.
 *
 * Les balises sont lues par `tests/helpers/balises-jsx.ts`, qui équilibre
 * accolades et guillemets : un motif qui s'arrête au premier `>` coupe la
 * balise sur la flèche d'un `onChange={(e) => …}`.
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
const HORS_ARGENT = [...tsx("app"), ...tsx("components")].filter((f) => !surCheminArgent(f));
const NON_TEXTE = new Set(["checkbox", "radio", "file", "hidden", "range", "color", "submit"]);
const CHAMP = /(?<![\w-])champ(?![\w-])/;

type Champ = { f: string; ligne: number; nom: string; type: string; attrs: string; classes: string | null; index: number; src: string };
function champs(): Champ[] {
  const out: Champ[] = [];
  for (const f of HORS_ARGENT) {
    const src = lire(f);
    for (const b of balises(src, ["input", "select", "textarea"])) {
      const t = attribut(b.attrs, "type");
      // Un mot de passe à bascule (`type={voir ? "text" : "password"}`, connexion,
      // Phase 4) reste un mot de passe : sans cela il sortirait de C5 en silence.
      const type = t && "litteral" in t ? t.litteral : t && /"password"/.test(t.expr) ? "password" : b.nom === "input" ? "text" : b.nom;
      if (NON_TEXTE.has(type)) continue;
      out.push({ f, ligne: b.ligne, nom: b.nom, type, attrs: b.attrs, classes: classes(attribut(b.attrs, "className"), src), index: b.index, src });
    }
  }
  return out;
}
const TOUS = champs();
const ou = (c: Champ) => `${c.f}:${c.ligne} <${c.nom}>`;

/**
 * Les champs qui gardent leur propre dessin, NOMMÉS. Se périment dans les deux
 * sens : une exception devenue inutile fait rougir.
 */
const SANS_CHAMP: Record<string, string> = {
  "components/search-box.tsx": "la recherche de l'en-tête : une pilule de 44 px dans une barre collante. Revue en Phase 4 (A19) et gardée : la barre inférieure prend déjà 57 px en bas de l'écran, et 44 px tiennent la cible tactile",
  "components/etal-page.tsx": "« Ouvrir ma boutique » garde son échelle propre (V-23)",
};
/** Nommés pour les lecteurs d'écran seulement, et pourquoi. */
const SANS_LIBELLE_VISIBLE: Record<string, string> = {
  "app/admin/": "outils d'administration internes, en français, hors parcours public",
  "components/admin": "outils d'administration internes, en français, hors parcours public",
  "components/search-box.tsx": "champ de recherche : loupe et nom accessible, la convention de toute barre de recherche",
  "app/categories/page.tsx": "champ de recherche des rayons, même convention",
  "app/catalogue/page.tsx": "filtre de zone : un libellé visible pour la rangée (« Zòn »), chaque liste nommée par sa première option",
  "components/physical-product-form.tsx": "compatibilité véhicule : bloc en français sans clé i18n, chaque liste nommée par sa première option (« Marque… ») ; formulaire vendeur, hors du parcours acheteur de la Phase 4 : à traduire en Phase 5",
};
const exempte = (table: Record<string, string>, f: string) => Object.keys(table).some((k) => f === k || (k.endsWith("/") || !k.endsWith(".tsx") ? f.startsWith(k) : false));

test("C0 — le découpeur lit la balise entière, flèche comprise", () => {
  const src = `<input onChange={(e) => setX(e.target.value)} value={a > b ? "1" : "2"} className="champ mt-1" />`;
  const [b] = balises(src, ["input"]);
  assert.equal(classes(attribut(b.attrs, "className"), src), "champ mt-1");
  const tpl = 'const champ = "champ w-auto";\n<select className={`${champ} shrink-0`}>';
  assert.match(classes(attribut(balises(tpl, ["select"])[0].attrs, "className"), tpl) ?? "", /champ w-auto/);
  assert.ok(TOUS.length >= 130, `seulement ${TOUS.length} champs lus : le découpeur est devenu aveugle`);
});

test("C1 — `.champ` : 48 px, 16 px, contour à 3:1, anneau conservé, état invalide", () => {
  const css = lire("app/globals.css").replace(/\/\*[\s\S]*?\*\//g, " ");
  const corps = (sel: string) => [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(([, s]) => s.split(",").map((x) => x.trim()).includes(sel)).map(([, , c]) => c).join(";");
  const c = corps(".champ");
  assert.match(c, /min-height:\s*--spacing\(12\)/, "48 px");
  assert.match(c, /font-size:\s*var\(--text-base\)/, "16 px : sous 16, Safari zoome la page au focus");
  assert.match(c, /border:\s*1px solid var\(--color-contour\)/, "le contour à 3:1, pas `--line` (1,2:1)");
  assert.match(corps(".champ:focus-visible"), /border-color:\s*var\(--color-accent\)/);
  assert.match(corps('.champ[aria-invalid="true"]'), /border-color:\s*var\(--color-danger\)/);
  assert.match(corps(".libelle"), /display:\s*block/);
  assert.match(corps(".message-erreur"), /color:\s*var\(--color-danger-text\)/);
  for (const [, sel, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (/\.champ/.test(sel)) assert.doesNotMatch(body, /outline:\s*(none|0)/, `« ${sel.trim()} » éteint l'anneau de focus`);
  }
});

test("C2 — hors chemin de l'argent, chaque champ de saisie porte `champ`", () => {
  const fautes = TOUS.filter((c) => !exempte(SANS_CHAMP, c.f) && !(c.classes !== null && CHAMP.test(c.classes))).map((c) => `${ou(c)} « ${(c.classes ?? "∅").slice(0, 60)} »`);
  assert.deepEqual(fautes, [], "Champ dessiné à la main : écrivez `champ` (48 px, 16 px, contour à 3:1) :\n  " + fautes.join("\n  "));
  const perimes = Object.keys(SANS_CHAMP).filter((k) => !TOUS.some((c) => c.f === k && !(c.classes !== null && CHAMP.test(c.classes))));
  assert.deepEqual(perimes, [], `exception(s) périmée(s) dans SANS_CHAMP : ${perimes.join(", ")}`);
});

test("C3 — aucun champ n'éteint l'anneau de focus", () => {
  const fautes = TOUS.filter((c) => /(?<![\w-])(?:focus:|focus-visible:)?outline-none(?![\w-])/.test(c.classes ?? "")).map(ou);
  assert.deepEqual(fautes, [], "`outline-none` sur un champ : l'anneau de 2 px du brief disparaît au clavier :\n  " + fautes.join("\n  "));
});

test("C4 — chaque champ a un libellé visible, hors exceptions nommées", () => {
  const fautes: string[] = [];
  for (const c of TOUS) {
    if (exempte(SANS_LIBELLE_VISIBLE, c.f)) continue;
    const avant = c.src.slice(0, c.index);
    const ouverture = avant.lastIndexOf("<label");
    // Une enveloppe VIDE ne nomme rien : il faut du texte (ou une expression)
    // entre `<label>` et le champ, une fois les balises retirées.
    const enveloppe = ouverture > avant.lastIndexOf("</label>") && /\S/.test(avant.slice(avant.indexOf(">", ouverture) + 1).replace(/<[^>]+>/g, ""));
    const id = attribut(c.attrs, "id");
    const pour = id ? c.src.includes(`htmlFor=${"litteral" in id ? `"${id.litteral}"` : `{${id.expr}}`}`) : false;
    if (!enveloppe && !pour) fautes.push(`${ou(c)}${/aria-label=/.test(c.attrs) ? " (aria-label seul)" : ""}`);
  }
  assert.deepEqual(fautes, [], "Champ sans libellé visible (le texte indicatif disparaît à la première lettre) :\n  " + fautes.join("\n  "));
  // Témoin : les exceptions nommées couvrent bien des champs sans libellé.
  const couverts = TOUS.filter((c) => exempte(SANS_LIBELLE_VISIBLE, c.f) && /aria-label=/.test(c.attrs));
  assert.ok(couverts.length >= 5, "les exceptions de libellé ne couvrent plus rien : à relire");
});

test("C5 — e-mail, téléphone et mot de passe : clavier et remplissage justes", () => {
  const fautes: string[] = [];
  for (const c of TOUS) {
    if (!["email", "tel", "password"].includes(c.type)) continue;
    if (!/autoComplete=/.test(c.attrs)) fautes.push(`${ou(c)} type=${c.type} sans autoComplete`);
    if (c.type !== "password" && !/inputMode=/.test(c.attrs)) fautes.push(`${ou(c)} type=${c.type} sans inputMode`);
  }
  assert.deepEqual(fautes, [], fautes.join("\n"));
  assert.ok(TOUS.filter((c) => ["email", "tel", "password"].includes(c.type)).length >= 6, "les champs e-mail, téléphone et mot de passe ne sont plus lus");
});

test("C6 — une erreur se dit en texte ET en icône (`MessageErreur`)", () => {
  const comp = lire("components/message-erreur.tsx");
  assert.match(comp, /role="alert"/);
  assert.match(comp, /<Icone taille=\{16\}>/, "le message porte son icône");
  const ROUGE_SEUL = /<p(?:\s+id=(?:"[^"]*"|\{[^}]*\}))?\s+role="alert"\s+className="[^"]*\btext-danger-text\b/;
  // Commentaires retirés : décrire l'ancien motif n'est pas l'employer.
  const code = (s: string) => s.replace(/\{\/\*[\s\S]*?\*\/\}|\/\*[\s\S]*?\*\//g, " ");
  const MULTILIGNE = /<p\s+role="alert"\s+className="[^"]*\btext-danger-text\b/;
  const fautes = HORS_ARGENT.filter((f) => ROUGE_SEUL.test(code(lire(f))) || MULTILIGNE.test(code(lire(f)).replace(/\s+/g, " ")));
  assert.deepEqual(fautes, [], "Erreur en rouge seul : écrivez `<MessageErreur>` :\n  " + fautes.join("\n  "));
  const emplois = HORS_ARGENT.filter((f) => /<MessageErreur[\s>]/.test(lire(f))).length;
  assert.ok(emplois >= 30, `seulement ${emplois} fichiers emploient MessageErreur`);
  // Une erreur portée par un champ est reliée à lui.
  const cat = lire("app/catalogue/page.tsx");
  assert.match(cat, /aria-describedby=\{priceRangeInvalid \? "prix-erreur" : undefined\}/);
  assert.match(cat, /<MessageErreur id="prix-erreur"/);
});
