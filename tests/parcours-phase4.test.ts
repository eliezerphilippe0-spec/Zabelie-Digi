import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DICT } from "../lib/i18n";
import { lirePolice } from "./woff2-lecteur";

/**
 * PARCOURS — chantier design, Phase 4 (`docs/design/PHASE-4.md`, V-28).
 *
 * Chaque test porte sur ce qui COMMANDE le comportement (la condition, la
 * source, l'attribut), jamais sur un libellé seul : un libellé survit à un
 * garde rendu inatteignable (règle du dépôt).
 */

const lire = (p: string) => readFileSync(p, "utf8");
const FORM = lire("components/connexion-form.tsx");
const LANGUES = Object.keys(DICT) as Array<keyof typeof DICT>;

test("P1 — connexion : un titre qui dit où l'on est, avec son mot d'accent, dans les quatre langues", () => {
  // « Konekte » était titre, onglet et bouton à la fois (audit Phase 0).
  assert.match(FORM, /<TitreAccent texte=\{mode === "signin" \? labels\.titleSignin : labels\.titleSignup\} accent=\{labels\.titleAccent\} \/>/);
  const police = lirePolice(readFileSync("app/fonts/InstrumentSerifZabelie.woff2"));
  for (const lang of LANGUES) {
    const d = DICT[lang] as Record<string, string>;
    const mot = d["auth.title.accent"];
    for (const cle of ["auth.title.signin", "auth.title.signup"]) {
      assert.equal(d[cle].split(mot).length - 1, 1, `${lang} : « ${mot} » doit figurer une fois dans « ${d[cle]} »`);
      assert.notEqual(d[cle], d["auth.tab.signin"], `${lang} : le titre répète l'onglet`);
    }
    assert.deepEqual([...mot].filter((c) => !police.caracteres.has(c.codePointAt(0)!)), [], `${lang} : lettres absentes de la police d'accent`);
  }
});

test("P2 — connexion : le mot de passe s'affiche à la demande, et le bouton dit son état", () => {
  assert.match(FORM, /type=\{voirMdp \? "text" : "password"\}/, "la bascule commande le type du champ");
  assert.match(FORM, /onClick=\{\(\) => setVoirMdp\(\(v\) => !v\)\}\s*aria-pressed=\{voirMdp\}\s*aria-controls="auth-password"\s*aria-label=\{voirMdp \? labels\.hidePassword : labels\.showPassword\}/);
  assert.match(FORM, /className="champ pr-14"/, "le texte ne passe pas sous le bouton");
  for (const lang of LANGUES) {
    const d = DICT[lang] as Record<string, string>;
    assert.ok(d["auth.password.show"] && d["auth.password.hide"] && d["auth.password.show"] !== d["auth.password.hide"], `${lang} : libellés de la bascule`);
  }
});

test("P3 — connexion : focus sur le premier champ du mode affiché, oubli en lien texte, erreurs avec icône", () => {
  // Inscription : le nom vient en premier ; connexion : l'e-mail.
  assert.match(FORM, /id="auth-name"[\s\S]{0,200}?autoFocus\s/, "le nom porte le focus quand il est affiché");
  assert.match(FORM, /id="auth-email"[\s\S]{0,200}?autoFocus=\{mode === "signin"\}/);
  assert.match(FORM, /href="\/mot-de-passe-oublie"\s*className="bouton bouton-texte bouton-compact"/);
  assert.match(FORM, /\{msg && \(msg === labels\.signupSuccess \|\| msg === labels\.demoMode\s*\? <p role="status"[^>]*>\{msg\}<\/p>\s*: <MessageErreur className="mt-4">\{msg\}<\/MessageErreur>\)\}/,
    "une erreur passe par MessageErreur ; seuls le succès et le mode démonstration restent une information");
});
