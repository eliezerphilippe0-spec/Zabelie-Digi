import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * DÉCONNEXION (2026-08-15) — ce qui doit rester vrai.
 *
 * ⚠️ CE QUE CE FICHIER NE PROUVE PAS, et il faut le lire avant de s'y fier :
 * il lit du TEXTE, pas un comportement. Deux critères d'acceptation ne sont
 * PAS testables sans un vrai Supabase et deux navigateurs —
 *   · « une seconde session ouverte ailleurs est invalidée » ;
 *   · « un GET sur la route ne déconnecte pas ».
 * Ils sont approchés ici par ce qui les COMMANDE (`scope: "global"` présent,
 * aucun `GET` exporté). La vérification comportementale reste à faire à la
 * main sur le déploiement, et elle n'est pas remplaçable.
 */

/**
 * ⚠️ Les interdictions de chaîne portent sur le CODE, jamais sur les
 * commentaires — sinon elles interdisent d'EXPLIQUER le défaut qu'elles
 * surveillent. Mesuré ici même : `!/auth.signOut/` a d'abord échoué parce que
 * l'en-tête du bouton raconte l'ancien appel client. Même défaut que la
 * sonde de `0059` qui rougissait sur l'en-tête expliquant la chaîne à ne pas
 * reproduire (tests/fichier-sans-livrable.test.ts).
 */
const sansCommentaires = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const ROUTE = readFileSync("app/api/auth/signout/route.ts", "utf8");
const BOUTON = readFileSync("components/sign-out-button.tsx", "utf8");
const NAV = readFileSync("components/site-nav.tsx", "utf8");
const COMPTE = readFileSync("components/account-actions.tsx", "utf8");
const BOUTON_CODE = sansCommentaires(BOUTON);
const COMPTE_CODE = sansCommentaires(COMPTE);

test("la révocation est GLOBALE — tous les appareils, pas seulement celui-ci", () => {
  // La liaison : le scope est passé à l'appel de signOut, pas mentionné à côté.
  assert.match(
    ROUTE,
    /await supabase\.auth\.signOut\(\{ scope: "global" \}\)/,
    "Sans scope global, « j'ai prêté mon téléphone la semaine dernière » reste vrai après déconnexion."
  );
});

test("AUCUN GET n'est exporté — un <img src> tiers ne déconnecte personne", () => {
  assert.ok(
    !/export\s+(async\s+)?function\s+GET/.test(ROUTE),
    "Un GET exporté permettrait une déconnexion forcée par CSRF."
  );
  assert.match(ROUTE, /export async function POST/);
});

test("les cookies sont effacés côté SERVEUR, par préfixe et non par nom deviné", () => {
  /* Un nom exact deviné qui ne correspond pas au projet laisserait la session
   * intacte EN SILENCE — exactement le défaut qu'on répare. Le balayage par
   * préfixe est donc la condition, pas un détail d'implémentation. */
  assert.match(
    ROUTE,
    /for \(const c of cookieStore\.getAll\(\)\)[\s\S]{0,200}c\.name\.startsWith\("sb-"\)[\s\S]{0,200}reponse\.cookies\.set\(c\.name, "", \{ path: "\/", maxAge: 0 \}\)/,
    "L'effacement doit parcourir les cookies RÉELS de la requête et les vider sur la réponse."
  );
});

test("le cache SSR est purgé — une page rendue avec les données du compte ne survit pas", () => {
  assert.match(ROUTE, /revalidatePath\("\/", "layout"\)/);
});

test("la redirection est un 303 — recharger la page ne repostera pas", () => {
  assert.match(
    ROUTE,
    /NextResponse\.redirect\(new URL\("\/", req\.url\), \{\s*\n?\s*status: 303/
  );
});

test("une révocation distante en panne n'empêche PAS d'effacer les cookies locaux", () => {
  /* Le poste partagé d'abord : l'utilisateur qui clique veut que CE poste
   * soit propre, même si Supabase est injoignable. Le contrôle porte sur
   * l'absence de sortie anticipée dans la branche d'erreur. */
  const brancheErreur = ROUTE.slice(
    ROUTE.indexOf("if (error) {"),
    ROUTE.indexOf("/* Effacement EXPLICITE")
  );
  assert.ok(brancheErreur.length > 0, "la branche d'erreur doit exister");
  assert.ok(
    !/return\s/.test(brancheErreur),
    "un `return` dans la branche d'erreur laisserait la session locale ouverte"
  );
});

test("le bouton est un FORMULAIRE POST — il marche sans JavaScript", () => {
  assert.match(BOUTON, /<form action="\/api\/auth\/signout" method="POST"/);
  assert.match(BOUTON, /<button\s*\n?\s*type="submit"/);
  // Le défaut d'origine : plus aucun signOut client nulle part.
  assert.ok(
    !/use client/.test(BOUTON_CODE) && !/auth\.signOut/.test(BOUTON_CODE),
    "un signOut() client ne révoque que la session locale et ne vide pas les cookies serveur"
  );
});

test("plus AUCUN signOut client dans le dépôt — le faux-semblant est fermé", () => {
  for (const [f, src] of [
    ["components/account-actions.tsx", COMPTE_CODE],
    ["components/sign-out-button.tsx", BOUTON_CODE],
  ] as const) {
    assert.ok(
      !/auth\.signOut/.test(src),
      `${f} appelle encore signOut() côté client`
    );
  }
  // Et la suppression de compte passe par le MÊME endpoint.
  assert.match(COMPTE, /fetch\("\/api\/auth\/signout", \{ method: "POST" \}\)/);
});

test("la déconnexion est atteignable sur MOBILE — le terrain visé", () => {
  /* Elle vivait uniquement en `sm:block`, donc invisible à 390 px : le
   * cybercafé et l'Android partagé sont précisément ce format. */
  const barreMobile = NAV.slice(NAV.indexOf("md:hidden"));
  assert.match(
    barreMobile,
    /\{user && \(\s*\n\s*<SignOutButton/,
    "la barre mobile doit porter la déconnexion, conditionnée à une session"
  );
});

test("le libellé passe par i18n dans les quatre langues, kreyòl compris", () => {
  const i18n = readFileSync("lib/i18n.ts", "utf8");
  const occurrences = i18n.match(/"nav\.logout":/g) ?? [];
  assert.equal(occurrences.length, 4, "nav.logout doit exister dans les 4 langues");
  // « Dekonekte », pas « Soti » — qui se lit « quitter la page ».
  assert.match(i18n, /"nav\.logout": "Dekonekte"/);
  assert.ok(!/"nav\.logout": "Soti"/.test(i18n), "« Soti » est ambigu");
  assert.match(NAV, /label=\{t\(lang, "nav\.logout"\)\}/);
});
