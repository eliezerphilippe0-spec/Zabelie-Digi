import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LANGS, t, tn } from "../lib/i18n";

/**
 * M4 (audit du 2026-10-27) — LES CODES PROMO DU VENDEUR.
 *
 * Avant : six libellés français en dur dans `zabelie-coupon-manager.tsx`
 * (Code, Remise %, Max, Créer, utilisé(s), Désactiver/Réactiver) ; la bascule
 * faisait `.catch(() => undefined)` puis `router.refresh()` — un échec était
 * avalé, l'écran se rechargeait sur l'ancien état sans un mot, et le bouton
 * (~26 px) restait cliquable pendant l'appel.
 *
 * Gardé ici sur ce qui COMMANDE : la condition qui pose l'attente, la branche
 * qui rafraîchit, celle qui affiche l'erreur, la liaison du bouton à l'état
 * de SA ligne. Mutations éprouvées : voir le message du commit.
 */

const brut = readFileSync("components/zabelie-coupon-manager.tsx", "utf8");
const SRC = brut.replace(/\{\/\*[\s\S]*?\*\/\}|\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1 ");
const PAGE = readFileSync("app/tableau-de-bord/codes-promo/page.tsx", "utf8");

test("P1 — la bascule passe par la porte, et n'avale plus l'échec", () => {
  assert.match(SRC, /import \{ appelAvecSession, appelSession, type IssueAppel \} from "@\/lib\/appel-session";/);
  assert.doesNotMatch(SRC, /\.catch\(\(\) => undefined\)/, "l'échec est de nouveau avalé");
  assert.doesNotMatch(SRC, /await fetch\(|await res\.json\(\)/, "lecture de réponse hors de la porte");
  // L'attente est posée sur LA ligne AVANT l'appel PATCH.
  assert.match(
    SRC,
    /async function toggle\(id: string, active: boolean\) \{\s*if \(occupee\(id\)\) return;\s*setEnCours\(\(s\) => new Set\(s\)\.add\(id\)\);[\s\S]{0,200}const issue = await appelAvecSession\("\/api\/coupons", \{\s*method: "PATCH",/,
  );
  // Seul un succès rafraîchit ; un échec pose l'erreur sur la ligne, traduite.
  assert.match(
    SRC,
    /if \(issue\.etat === "ok"\) \{[\s\S]{0,400}demarrerRafraichissement\(\(\) => router\.refresh\(\)\);\s*\} else \{\s*setErreurs\(\(e\) => \(\{ \.\.\.e, \[id\]: phraseEchec\(issue, labels\) \}\)\);/,
  );
  // Réseau et refus ne se confondent pas.
  assert.match(SRC, /if \(issue\.etat === "reseau"\) return labels\.network;\s*if \(issue\.etat === "refus"\) return issue\.error \?\? labels\.failed;/);
});

test("P2 — le bouton de SA ligne est désactivé pendant l'appel et jusqu'au nouvel affichage", () => {
  assert.match(SRC, /const occupee = \(id: string\) => enCours\.has\(id\) \|\| \(rafraichit && ligneRafraichie === id\);/);
  const bouton = /<button\s+type="button"\s+onClick=\{\(\) => toggle\(c\.id, !c\.active\)\}\s+aria-disabled=\{occupee\(c\.id\)\}\s+aria-busy=\{occupee\(c\.id\)\}[\s\S]*?className="([^"]*)"[\s\S]*?>\s*\{occupee\(c\.id\) \? labels\.toggling : c\.active \? labels\.deactivate : labels\.reactivate\}/.exec(SRC);
  assert.ok(bouton, "bouton de bascule non lié à l'état de sa ligne");
  assert.match(bouton[1], /\bmin-h-11\b/, "bouton de bascule sous 44 px");
  assert.doesNotMatch(bouton[1], /\bpy-1\b|\btext-xs\b/);
  // L'erreur de la ligne est annoncée, sous la ligne.
  assert.match(SRC, /\{erreurs\[c\.id\] && \(\s*<p role="alert"[^>]*>\s*\{erreurs\[c\.id\]\}/);
  assert.match(SRC, /\{error && \(\s*<p role="alert"[^>]*>\s*\{error\}/);
});

test("P3 — plus aucun libellé français en dur ; la page passe les dix libellés par t()", () => {
  for (const motif of [/>\s*Code\s*</, /Remise %/, /Max \(option\)/, /"Créer"/, /utilisé\(s\)/, /"Désactiver"|"Réactiver"/, /"Création impossible\.|"Connexion impossible\./]) {
    assert.doesNotMatch(SRC, motif, String(motif));
  }
  for (const [prop, cle] of [
    ["code", "vendeur.promo.code"], ["percent", "vendeur.promo.remise"], ["maxUses", "vendeur.promo.max"],
    ["create", "vendeur.promo.creer"], ["creating", "vendeur.promo.creation"],
    ["deactivate", "vendeur.promo.desactiver"], ["reactivate", "vendeur.promo.reactiver"],
    ["toggling", "vendeur.promo.bascule"], ["network", "error.network"], ["failed", "vendeur.promo.erreur"],
  ]) {
    assert.match(PAGE, new RegExp(`${prop}: t\\(lang, "${cle.replace(/\./g, "\\.")}"\\)`), prop);
  }
  assert.match(PAGE, /coupons=\{lignes\}/, "la liste passée doit porter le décompte accordé");
});

test("P4 — le décompte s'accorde par `tn`, côté serveur, selon la présence d'un plafond", () => {
  assert.match(
    PAGE,
    /usage: c\.max_uses !== null\s*\? tn\(lang, c\.uses, "vendeur\.promo\.usageMax\.one", "vendeur\.promo\.usageMax", \{ n: String\(c\.uses\), max: String\(c\.max_uses\) \}\)\s*: tn\(lang, c\.uses, "vendeur\.promo\.usage\.one", "vendeur\.promo\.usage", \{ n: String\(c\.uses\) \}\)/,
  );
  // Les formes produites — l'accord vient de la règle de chaque langue.
  const sans = (l: (typeof LANGS)[number], n: number) =>
    tn(l, n, "vendeur.promo.usage.one", "vendeur.promo.usage", { n: String(n) });
  const avec = (l: (typeof LANGS)[number], n: number, max: number) =>
    tn(l, n, "vendeur.promo.usageMax.one", "vendeur.promo.usageMax", { n: String(n), max: String(max) });
  assert.equal(sans("fr", 0), "0 utilisation");
  assert.equal(sans("fr", 1), "1 utilisation");
  assert.equal(sans("fr", 3), "3 utilisations");
  assert.equal(avec("fr", 3, 5), "3 utilisations sur 5");
  assert.equal(sans("ht", 3), "3 itilizasyon");
  assert.equal(avec("ht", 1, 5), "1 itilizasyon sou 5");
  assert.equal(sans("en", 1), "1 use");
  assert.equal(sans("en", 0), "0 uses");
  assert.equal(avec("en", 3, 5), "3 of 5 uses");
  assert.equal(sans("es", 2), "2 usos");
  assert.equal(avec("es", 1, 5), "1 de 5 usos");
  // Le composant client n'importe ni `t` ni la règle : il reçoit la chaîne.
  assert.doesNotMatch(brut, /from "@\/lib\/i18n"/);
  for (const l of LANGS) assert.notEqual(t(l, "vendeur.promo.erreur"), "", l);
});

test("P5 — le focus survit à l'attente : `aria-disabled` + garde, jamais `disabled`", () => {
  // Seconde passe (m4) : un bouton `disabled` pendant l'appel perd le focus,
  // qui tombe sur `body` ; après un échec, le clavier ne sait plus où il est.
  assert.doesNotMatch(SRC, /(?<![-\w])disabled=\{/, "bouton `disabled` pendant une action");
  assert.match(SRC, /async function create\(e: React\.FormEvent\) \{\s*e\.preventDefault\(\);\s*if \(loading\) return;\s*setLoading\(true\);/);
  assert.match(SRC, /<button\s+type="submit"\s+aria-disabled=\{loading\}/);
  // `occupee` est défini AVANT les gestionnaires qui s'en servent comme garde.
  assert.ok(SRC.indexOf("const occupee =") < SRC.indexOf("async function toggle("), "garde définie après son usage");
});

test("P6 — à 360 px, un code de 24 caractères sans tiret se coupe au lieu de passer sous le bouton", () => {
  assert.match(SRC, /<span id=\{`cp-\$\{c\.id\}`\} className=\{`code-lisible break-all [^`]*`\}>\s*\{c\.code\}/);
  // Son conteneur peut rétrécir, le bouton non.
  assert.match(SRC, /<div className="min-w-0">\s*<span id=\{`cp-/);
  assert.match(SRC, /className="min-h-11 shrink-0 /);
});
