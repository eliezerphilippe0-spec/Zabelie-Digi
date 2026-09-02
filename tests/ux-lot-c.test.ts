import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * LOT C DE L'AUDIT UX (2026-09-02) — les formulaires ont des étiquettes.
 *
 * La liaison qui compte : `<label htmlFor="X">` ET `<input id="X">` — les
 * deux, sur le même identifiant. Un label sans htmlFor est du texte ; un
 * input sans id n'est relié à rien. Le motif est vérifié par paire.
 */

const RACINE = join(import.meta.dirname, "..");
const lire = (p: string) => readFileSync(join(RACINE, p), "utf8");

function paire(src: string, id: string, fichier: string) {
  assert.match(src, new RegExp(`<label htmlFor="${id}"`), `${fichier} : label htmlFor="${id}" absent`);
  assert.match(src, new RegExp(`<(input|select|textarea)\\s[^>]*id="${id}"`), `${fichier} : champ id="${id}" absent`);
}

test("UC1 — connexion / inscription : trois champs, trois étiquettes visibles reliées", () => {
  const src = lire("components/connexion-form.tsx");
  for (const id of ["auth-name", "auth-email", "auth-password"]) paire(src, id, "connexion-form");
  // Plus de placeholder-comme-étiquette ni d'aria-label redondant sur ces champs.
  assert.doesNotMatch(src, /placeholder=\{labels\.(namePh|emailPh|passwordPh)\}/);
  assert.doesNotMatch(src, /aria-label=\{labels\.(namePh|emailPh|passwordPh)\}/);
  // L'autocomplétion est déclarée : c'est ce qui rend le clavier mobile utile.
  assert.match(src, /autoComplete="email"/);
  assert.match(src, /autoComplete=\{mode === "signup" \? "new-password" : "current-password"\}/);
});

test("UC2 — profil public : cinq étiquettes reliées, aucune chaîne française en dur", () => {
  const src = lire("components/profile-form.tsx");
  for (const id of ["profil-nom", "profil-avatar", "profil-pays", "profil-departement", "profil-bio"]) {
    paire(src, id, "profile-form");
  }
  // Ce qui COMMANDE : un attribut placeholder / aria-label / <option> qui
  // porte une chaîne littérale (pas une expression). Le commentaire qui
  // raconte l'ancien état peut citer « Nom d'affichage » sans rougir.
  assert.doesNotMatch(
    src,
    /(placeholder|aria-label)="[^"]*[A-Za-zÀ-ÿ]{3,}[^"]*"/,
    "profile-form : un placeholder ou aria-label porte encore une chaîne en dur"
  );
  assert.doesNotMatch(src, /<option value="">[^<{]*[A-Za-zÀ-ÿ]{3,}[^<{]*<\/option>/, "une <option> porte encore une chaîne en dur");
  assert.match(src, /labels: ProfileLabels;/, "les étiquettes arrivent par une prop typée, pas par défaut");
});

test("UC3 — le tableau de bord fournit les étiquettes en langue de session", () => {
  const src = lire("app/tableau-de-bord/page.tsx");
  assert.match(src, /<ProfileForm[\s\S]{0,300}?labels=\{\{[\s\S]{0,400}?name: t\(lang, "profile\.name"\)/);
  assert.doesNotMatch(src, />\s*Voir mon profil →\s*</, "« Voir mon profil → » était en dur");
});

test("UC4 — composeur de message et prix flash : nommés pour les lecteurs d'écran", () => {
  // Adjacence réelle, pas fenêtre : l'aria-label précède directement `rows`.
  // (Première version : `<textarea[\s\S]{0,300}?aria-label` — le commentaire
  // qui explique l'attribut dépassait la fenêtre. Ré-ancré, pas élargi.)
  assert.match(lire("components/message-form.tsx"), /aria-label=\{labels\.placeholder\}\s*rows=\{3\}/);
  const flash = lire("components/flash-manager.tsx");
  for (const k of ["pricePh", "hoursPh", "unitsPh"]) {
    assert.match(flash, new RegExp(`placeholder=\\{labels\\.${k}\\}\\s*aria-label=\\{labels\\.${k}\\}`), `flash-manager : ${k} sans aria-label`);
  }
});

test("UC5 — les six clés profile.* existent dans les quatre langues", () => {
  const i18n = lire("lib/i18n.ts");
  for (const k of ["profile.name", "profile.avatar", "profile.country", "profile.department", "profile.bio", "profile.optional", "dashboard.profile.view"]) {
    const n = (i18n.match(new RegExp(`^\\s*"${k.replace(".", "\\.")}": `, "gm")) ?? []).length;
    assert.equal(n, 4, `${k} : ${n} langue(s) sur 4`);
  }
});
