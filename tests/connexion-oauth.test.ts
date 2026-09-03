import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * V-19 — la connexion par fournisseurs tiers, telle que le code la COMMANDE.
 *
 * Chaque assertion porte sur une condition, un appel ou une liaison — jamais
 * sur un libellé (CLAUDE.md, « une assertion structurelle porte sur ce qui
 * COMMANDE »). Mutations éprouvées avant confiance :
 *   CO1  `providers.length > 0 &&` → `false &&`            → rouge
 *   CO2  `redirectTo: urlDeRetourOAuth(window.location.origin, nextPath)`
 *        → `redirectTo: window.location.origin`             → rouge
 *   CO3  `min-h-11` retiré du bouton fournisseur             → rouge
 *   CO4  `resolveAuthProviders(process.env.NEXT_PUBLIC_AUTH_PROVIDERS)`
 *        → `resolveAuthProviders("google")`                  → rouge
 *   CO5  `if (erreurFournisseur)` → `if (false)`             → rouge
 */

const FORM = readFileSync("components/connexion-form.tsx", "utf8");
const PAGE = readFileSync("app/connexion/page.tsx", "utf8");
const CALLBACK = readFileSync("app/auth/callback/route.ts", "utf8");

function sansCommentaires(s: string): string {
  return s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1 ");
}

test("CO1 — les boutons ne se rendent QUE si la liste est non vide (la condition, pas le texte)", () => {
  const src = sansCommentaires(FORM);
  // La condition qui commande le bloc, suivie du map des fournisseurs.
  assert.match(
    src,
    /\{providers\.length > 0 &&[\s\S]{0,600}providers\.map\(\(p\) =>/
  );
});

test("CO2 — l'appel OAuth part avec redirectTo = urlDeRetourOAuth(origine de la page, next sûr)", () => {
  const src = sansCommentaires(FORM);
  // `nextPath` est LIÉ à safeNext, puis passé à l'URL de retour : la liaison
  // est dans le motif, pas seulement l'adjacence.
  assert.match(src, /const nextPath = safeNext\(searchParams\.get\("next"\)\)/);
  assert.match(
    src,
    /signInWithOAuth\(\{\s*provider: p\.supabase,\s*options: \{\s*redirectTo: urlDeRetourOAuth\(window\.location\.origin, nextPath\)/
  );
  // Les portées ne partent que si le fournisseur en déclare.
  assert.match(src, /\.\.\.\(p\.scopes \? \{ scopes: p\.scopes \} : \{\}\)/);
});

test("CO3 — chaque bouton fournisseur est une cible tactile (min-h-11) et un vrai <button type=\"button\">", () => {
  const src = sansCommentaires(FORM);
  const bouton = /providers\.map\(\(p\) => \(\s*<button[\s\S]{0,400}?className="[^"]*\bmin-h-11\b[^"]*"/;
  assert.match(src, bouton);
  assert.match(src, /providers\.map\(\(p\) => \(\s*<button\s+key=\{p\.id\}\s+type="button"/);
});

test("CO4 — la page lit la liste dans NEXT_PUBLIC_AUTH_PROVIDERS, côté serveur, via resolveAuthProviders", () => {
  const src = sansCommentaires(PAGE);
  assert.match(src, /resolveAuthProviders\(process\.env\.NEXT_PUBLIC_AUTH_PROVIDERS\)/);
  // Et chaque libellé est une clé LITTÉRALE, une par fournisseur connu.
  for (const id of ["google", "microsoft", "facebook", "apple"]) {
    assert.match(src, new RegExp(`${id}: "auth\\.oauth\\.${id}"`));
  }
  assert.match(src, /providers=\{providers\}/);
});

test("CO5 — le rappel renvoie un refus du fournisseur vers /connexion?erreur=fournisseur, AVANT l'échange du code", () => {
  const src = sansCommentaires(CALLBACK);
  const m = /const erreurFournisseur = url\.searchParams\.get\("error"\);\s*if \(erreurFournisseur\) \{[\s\S]{0,400}?\/connexion\?erreur=fournisseur/.exec(src);
  assert.ok(m, "le garde `if (erreurFournisseur)` doit commander la redirection");
  // Il précède `if (code)` : un `error` accompagné d'un `code` fantaisiste ne
  // doit pas tenter d'échange.
  assert.ok(m.index < src.indexOf("if (code) {"), "le garde doit précéder l'échange du code");
});

test("CO6 — le formulaire nomme la cause `fournisseur` à l'arrivée, comme `lien_expire`", () => {
  const src = sansCommentaires(FORM);
  assert.match(src, /erreur === "fournisseur"\s*\?\s*labels\.errProvider/);
});
